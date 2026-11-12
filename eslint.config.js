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
            {
              group: ['@capacitor/*'],
              message: 'sim은 순수 — 플랫폼 API는 platform/ 소관',
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
        {
          // 인자 없는 new Date()는 곧 현재 시각이다 — 인자 있는 new Date(ts)는 허용(ads·notifyPlan)
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'sim은 순수 — now는 인자로 받는다',
        },
      ],
    },
  },
];
