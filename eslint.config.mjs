import js from '@eslint/js';
import globals from 'globals';

export default [
  {ignores: ['dist/', 'node_modules/', 'renders/']},
  {
    files: ['src/**/*.js'],
    languageOptions: {ecmaVersion: 2022, sourceType: 'module', globals: globals.browser},
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', {caughtErrors: 'none'}],
      'no-empty': ['error', {allowEmptyCatch: true}]
    }
  },
  {
    files: ['tools/**/*.js', 'tools/**/*.cjs'],
    languageOptions: {ecmaVersion: 2022, sourceType: 'commonjs', globals: {...globals.node, THREE: 'readonly'}},
    rules: {'no-undef': 'error'}
  }
];
