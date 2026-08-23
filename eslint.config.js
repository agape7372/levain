import tseslint from 'typescript-eslint';

export default [
  {
    files: ['src/sim/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'three', message: 'sim은 순수 — now는 인자로 받는다' }],
          patterns: [
            {
              group: [
                '../render', '../render/*',
                '../ui', '../ui/*',
                '../platform', '../platform/*',
                '../store', '../store/*',
              ],
              message: 'sim은 순수 — now는 인자로 받는다',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'sim은 순수 — now는 인자로 받는다',
        },
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: 'sim은 순수 — now는 인자로 받는다',
        },
        {
          selector: "CallExpression[callee.object.name='performance'][callee.property.name='now']",
          message: 'sim은 순수 — now는 인자로 받는다',
        },
      ],
    },
  },
];
