import React from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <div className="App">
        {/* Application content */}
      </div>
    </ErrorBoundary>
  );
}

export default App;
