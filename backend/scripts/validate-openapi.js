#!/usr/bin/env node
/**
 * scripts/validate-openapi.js
 *
 * Validates the OpenAPI spec at ../openapi.yaml using @apidevtools/swagger-parser.
 * Additional checks:
 *   - At least 5 paths must be documented.
 *   - components.securitySchemes must be defined.
 *
 * Exit codes:
 *   0  — spec is valid and passes all checks
 *   1  — spec is invalid or a check failed
 */

'use strict';

const path = require('path');
const SwaggerParser = require('@apidevtools/swagger-parser');

const OPENAPI_PATH = path.resolve(__dirname, '../openapi.yaml');
const MIN_PATH_COUNT = 5;

SwaggerParser.validate(OPENAPI_PATH)
  .then((api) => {
    let passed = true;

    // -----------------------------------------------------------------------
    // 1. Count paths and HTTP operations
    // -----------------------------------------------------------------------
    const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']);

    const pathKeys = Object.keys(api.paths);
    const pathCount = pathKeys.length;
    let operationCount = 0;

    for (const pathItem of Object.values(api.paths)) {
      for (const method of Object.keys(pathItem)) {
        if (HTTP_METHODS.has(method)) operationCount++;
      }
    }

    console.log(`✓ OpenAPI spec parsed successfully`);
    console.log(`  Paths:      ${pathCount}`);
    console.log(`  Operations: ${operationCount}`);

    // -----------------------------------------------------------------------
    // 2. Minimum path count check
    // -----------------------------------------------------------------------
    if (pathCount < MIN_PATH_COUNT) {
      console.error(
        `✗ Too few paths: found ${pathCount}, expected at least ${MIN_PATH_COUNT}.`,
      );
      passed = false;
    } else {
      console.log(`✓ Path count check passed (${pathCount} >= ${MIN_PATH_COUNT})`);
    }

    // -----------------------------------------------------------------------
    // 3. securitySchemes check
    // -----------------------------------------------------------------------
    const components = api.components;
    if (
      !components ||
      typeof components.securitySchemes !== 'object' ||
      components.securitySchemes === null ||
      Object.keys(components.securitySchemes).length === 0
    ) {
      console.error(
        '✗ components.securitySchemes is missing or empty. ' +
          'At least one security scheme must be defined.',
      );
      passed = false;
    } else {
      const schemeNames = Object.keys(components.securitySchemes).join(', ');
      console.log(`✓ securitySchemes check passed (schemes: ${schemeNames})`);
    }

    // -----------------------------------------------------------------------
    // Final result
    // -----------------------------------------------------------------------
    if (!passed) {
      console.error('\nOpenAPI validation FAILED — see errors above.');
      process.exit(1);
    }

    console.log('\nOpenAPI validation PASSED.');
    process.exit(0);
  })
  .catch((err) => {
    console.error(`✗ OpenAPI spec INVALID: ${err.message}`);
    process.exit(1);
  });
