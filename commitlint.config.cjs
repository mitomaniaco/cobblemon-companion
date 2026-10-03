module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 100],
    // Mensagens do projeto são em português; não impõe caixa no assunto.
    'subject-case': [0],
  },
};
