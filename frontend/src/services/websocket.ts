/**
 * WebSocket service for real-time market updates
 * Handles connection management, authentication, subscriptions, and reconnection logic.
 */

export interface MarketUpdateEvent {
  type: 'market_update';
  marketId: string;
  eventType: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface SubscriptionMsg {
  type: 'subscribe_market_update' | 'unsubscribe_market_update';
  marketId: string;
}

export interface AuthMsg {
  type: 'auth';
  token: string;
}

export interface SubscribedAck {
  type: 'subscribed';
  channel: 'market_update';
  marketId: string;
}

export type WebSocketMessage = MarketUpdateEvent | SubscribedAck;

/**
 * Callback invoked when a market update is received
 */
export type MarketUpdateCallback = (event: MarketUpdateEvent) => void;

/**
 * Callback invoked on connection state changes
 */
export type ConnectionStateCallback = (state: ConnectionState) => void;

export type ConnectionState = 'disconnected' | 'connecting' | 'authenticated' | 'error';

interface PendingSubscription {
  callback: MarketUpdateCallback;
  abortController: AbortController;
}

/**
 * WebSocketService manages a single persistent WebSocket connection to the backend.
 * Handles auth, subscriptions, reconnection, and message routing.
 *
 * Usage:
 *   const service = WebSocketService.getInstance();
 *   service.onConnectionStateChange((state) => console.log(state));
 *   const unsubscribe = service.subscribe('market-123', (event) => {
 *     console.log('Market update:', event);
 *   });
 *   // Later:
 *   unsubscribe();
 */
export class WebSocketService {
  private static instance: WebSocketService | null = null;

  private ws: WebSocket | null = null;
  private url: string;
  private token: string | null = null;
  private state: ConnectionState = 'disconnected';
  private stateCallbacks: Set<ConnectionStateCallback> = new Set();
  private subscriptions: Map<string, Set<MarketUpdateCallback>> = new Map();
  private pendingSubscriptions: Map<string, PendingSubscription> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // ms, exponential backoff
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private messageBuffer: Array<SubscriptionMsg | AuthMsg> = [];
  private messageBufferTimer: ReturnType<typeof setTimeout> | null = null;
  private isDestroyed = false;

  private constructor(url: string) {
    this.url = url;
  }

  /**
   * Get or create the singleton WebSocket service instance
   */
  static getInstance(url?: string): WebSocketService {
    if (!WebSocketService.instance) {
      const wsUrl = url || this.buildWebSocketUrl();
      WebSocketService.instance = new WebSocketService(wsUrl);
    }
    return WebSocketService.instance;
  }

  /**
   * Build the WebSocket URL from the current page location
   */
  private static buildWebSocketUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = process.env.NEXT_PUBLIC_API_URL || window.location.host;
    const path = host.replace(/^https?:\/\//, '');
    return `${protocol}//${path}/ws`;
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Register a callback for connection state changes
   */
  onConnectionStateChange(callback: ConnectionStateCallback): () => void {
    this.stateCallbacks.add(callback);
    // Immediately call with current state
    callback(this.state);
    return () => this.stateCallbacks.delete(callback);
  }

  /**
   * Set the authentication token and connect if not already connected
   */
  async setToken(token: string): Promise<void> {
    this.token = token;
    if (this.state === 'disconnected') {
      await this.connect();
    } else if (this.state === 'error') {
      // If in error state, attempt to reconnect with new token
      this.reconnect();
    }
  }

  /**
   * Connect to the WebSocket server
   */
  private async connect(): Promise<void> {
    if (this.isDestroyed) {
      throw new Error('WebSocket service has been destroyed');
    }
    if (this.ws) {
      return; // Already connected or connecting
    }

    this.setState('connecting');

    try {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => this.onOpen();
      this.ws.onmessage = (e) => this.onMessage(e.data);
      this.ws.onerror = () => this.onError();
      this.ws.onclose = () => this.onClose();
    } catch (e) {
      this.setState('error');
      throw new Error(`Failed to create WebSocket: ${(e as Error).message}`);
    }
  }

  /**
   * Handle WebSocket open event
   */
  private onOpen(): void {
    if (!this.token) {
      this.setState('error');
      this.ws?.close(4001, 'No authentication token');
      return;
    }

    // Send authentication message
    const authMsg: AuthMsg = { type: 'auth', token: this.token };
    this.ws?.send(JSON.stringify(authMsg));

    // Don't set state to authenticated yet — wait for subscription acks or handle it server-side
    // For now, we'll set to authenticated after auth is sent
    // (in a production system, you might want a server-side ack first)
    this.setState('authenticated');
    this.reconnectAttempts = 0;

    // Process any buffered messages
    this.flushMessageBuffer();

    // Start heartbeat
    this.startHeartbeat();
  }

  /**
   * Handle WebSocket message
   */
  private onMessage(data: string): void {
    try {
      const msg = JSON.parse(data) as WebSocketMessage;

      if (msg.type === 'market_update') {
        const callbacks = this.subscriptions.get(msg.marketId);
        if (callbacks) {
          callbacks.forEach((cb) => cb(msg));
        }
      }

      if (msg.type === 'subscribed') {
        // Market update subscription acknowledged
        const pending = this.pendingSubscriptions.get(msg.marketId);
        if (pending) {
          this.subscriptions.set(msg.marketId, new Set([pending.callback]));
          this.pendingSubscriptions.delete(msg.marketId);
        }
      }
    } catch (e) {
      console.error('WebSocket message parse error:', e);
    }
  }

  /**
   * Handle WebSocket error
   */
  private onError(): void {
    console.error('WebSocket error');
    this.setState('error');
  }

  /**
   * Handle WebSocket close
   */
  private onClose(): void {
    this.ws = null;
    this.stopHeartbeat();

    if (!this.isDestroyed && this.state !== 'disconnected') {
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnect();
      } else {
        this.setState('error');
      }
    }
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  private reconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {
        // Error already handled in connect()
      });
    }, delay);
  }

  /**
   * Start sending periodic pings
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        // TypeScript doesn't recognize 'ping' on WebSocket, try ping() or fallback
        try {
          (this.ws as any).ping?.();
        } catch {
          // Some WebSocket implementations don't have ping
        }
      }
    }, 30000);
  }

  /**
   * Stop the heartbeat timer
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Subscribe to market updates for a specific market
   * Returns an unsubscribe function
   */
  subscribe(marketId: string, callback: MarketUpdateCallback): () => void {
    // Add to subscriptions map
    if (!this.subscriptions.has(marketId)) {
      this.subscriptions.set(marketId, new Set());
    }
    this.subscriptions.get(marketId)!.add(callback);

    // Create abort controller for this subscription
    const abortController = new AbortController();
    this.pendingSubscriptions.set(marketId, { callback, abortController });

    // Send subscription message (buffered if not connected)
    const msg: SubscriptionMsg = { type: 'subscribe_market_update', marketId };
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.bufferMessage(msg);
      // Ensure we're connected
      if (this.state === 'disconnected') {
        this.connect().catch(() => {
          // Error handling is in connect()
        });
      }
    }

    // Return unsubscribe function
    return () => {
      this.subscriptions.get(marketId)?.delete(callback);
      this.pendingSubscriptions.delete(marketId);

      // If no more callbacks for this market, send unsubscribe
      if (!this.subscriptions.get(marketId)?.size) {
        this.subscriptions.delete(marketId);
        const unsubMsg: SubscriptionMsg = { type: 'unsubscribe_market_update', marketId };
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify(unsubMsg));
        }
      }
    };
  }

  /**
   * Buffer a message to be sent once connected
   */
  private bufferMessage(msg: SubscriptionMsg | AuthMsg): void {
    this.messageBuffer.push(msg);

    // Debounce flushing to batch messages
    if (this.messageBufferTimer) clearTimeout(this.messageBufferTimer);
    this.messageBufferTimer = setTimeout(() => this.flushMessageBuffer(), 100);
  }

  /**
   * Send all buffered messages
   */
  private flushMessageBuffer(): void {
    if (this.messageBufferTimer) clearTimeout(this.messageBufferTimer);

    while (this.messageBuffer.length > 0) {
      const msg = this.messageBuffer.shift();
      if (msg && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(msg));
      }
    }
  }

  /**
   * Update internal state and notify listeners
   */
  private setState(newState: ConnectionState): void {
    if (this.state === newState) return;
    this.state = newState;
    this.stateCallbacks.forEach((cb) => cb(newState));
  }

  /**
   * Disconnect and clean up
   */
  disconnect(): void {
    this.isDestroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.messageBufferTimer) clearTimeout(this.messageBufferTimer);
    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.subscriptions.clear();
    this.pendingSubscriptions.clear();
    this.setState('disconnected');
  }

  /**
   * Reset the singleton instance (mostly for testing)
   */
  static reset(): void {
    if (WebSocketService.instance) {
      WebSocketService.instance.disconnect();
      WebSocketService.instance = null;
    }
  }
}

export default WebSocketService;
