'use strict';

const {lookup} = require('./opponents.cjs');

const slugOf = (speciesId) => speciesId.replace(/^[^:]+:/, '');

/** Dados declarados da forma (`forms.json`); `undefined` quando a espécie não declara essa forma. */
function formEntry(data, slug, formId) {
  const forms = lookup(data.forms ?? {}, slug);
  return forms ? lookup(forms, formId) : undefined;
}

/** Learnset da forma; forma sem golpes próprios usa os da espécie; `undefined` quando a espécie não declara essa forma. */
function learnsetOf(data, speciesId, formId) {
  const slug = slugOf(speciesId);
  if (formId === 'normal') return lookup(data.learnsets, slug);
  const form = formEntry(data, slug, formId);
  return form ? (form.learnset ?? lookup(data.learnsets, slug)) : undefined;
}

/** Evoluções da forma; `undefined` quando não há dados. */
function evolutionsOf(data, speciesId, formId) {
  const slug = slugOf(speciesId);
  return formId === 'normal' ? lookup(data.evolutions, slug) : formEntry(data, slug, formId)?.evolutions;
}

module.exports = {learnsetOf, evolutionsOf};
