import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import { lexicon, recipes } from "../public/scientific-word-generator/data.js";
import {
  enumerateCandidates,
  ERROR_CODES,
  generateWord,
} from "../public/scientific-word-generator/generator.js";

const clone = (value) => structuredClone(value);
const rngSequence = (...values) => {
  let index = 0;
  return () => values[index++];
};


function subset(leftId, rightId, relation, category) {
  const data = clone(lexicon);
  data.concepts = data.concepts.filter((concept) => concept.id === leftId || concept.id === rightId);
  data.blockedOutputs = [];
  data.blockedJoins = [];
  return {
    lexicon: data,
    recipes: [{
      id: "test-recipe",
      system: data.system.id,
      leftId,
      rightId,
      relation,
      category,
      quality: "reviewed",
      joinOverride: null,
    }],
  };
}

function generateSingle(leftId, rightId, relation, category) {
  return generateWord({ ...subset(leftId, rightId, relation, category), rng: () => 0 });
}

test("curated pool contains 56 unique, valid recipes across all categories", () => {
  assert.equal(recipes.length, 56);
  assert.equal(new Set(recipes.map((recipe) => recipe.id)).size, recipes.length);
  const { candidates, issues } = enumerateCandidates(lexicon, recipes);
  assert.equal(candidates.length, 56);
  assert.deepEqual(issues, []);
  assert.deepEqual(new Set(candidates.map((candidate) => candidate.category)), new Set(["anatomy", "condition", "process"]));
  assert.equal(new Set(candidates.map((candidate) => candidate.term)).size, 56);
});

test("disabled color entries stay out while requested concepts are live", () => {
  const { candidates, issues } = enumerateCandidates(lexicon, recipes);
  assert.deepEqual(issues, []);
  assert.ok(!lexicon.concepts.some((concept) => concept.id === "dark" || concept.id === "white"));
  assert.ok(!recipes.some((recipe) => recipe.leftId === "dark" || recipe.leftId === "white"));
  assert.deepEqual(
    new Set(candidates.filter((candidate) => candidate.trace.recipe.id >= "a27" && candidate.trace.recipe.id <= "a48").map((candidate) => candidate.definition)),
    new Set([
      "rose pink skin", "rigid tongue", "lumpy joint", "rounded head", "stretchy tongue", "underbelly skin",
      "unstable joint", "irregular sac or pouch", "noisy mouth", "small gland", "lacking tongue", "gold sac or pouch",
      "residue skin", "excessive tongue", "blue gland", "hairy joint", "tipped bone", "knuckled tongue",
      "airway joint", "pea sac or pouch", "bulb sac or pouch", "soil gland",
    ]),
  );
});

test("root attachment keeps the combining-form connector", () => {
  const result = generateSingle("frog", "gland-head", "root-pair", "anatomy");
  assert.equal(result.ok, true);
  assert.equal(result.value.term, "batrachoaden");
  assert.equal(result.value.trace.constructionRule, "combining-form-plus-root");
});

test("a vowel-initial root still keeps the combining-form connector", () => {
  const fixture = subset("frog", "gland-head", "root-pair", "anatomy");
  const head = fixture.lexicon.concepts.find((concept) => concept.id === "gland-head");
  head.id = "sight-head";
  head.english = { singular: "sight", dependent: "the sight" };
  head.right = { text: "opsis", attachment: "root" };
  fixture.recipes[0].rightId = "sight-head";
  const result = generateWord({ ...fixture, rng: () => 0 });
  assert.equal(result.ok, true);
  assert.equal(result.value.term, "batrachoopsis");
});

test("vowel suffix uses the bare stem", () => {
  const result = generateSingle("rump", "pain", "pain-of", "condition");
  assert.equal(result.ok, true);
  assert.equal(result.value.term, "pygalgia");
  assert.equal(result.value.trace.morphemes[0].surface, "pyg");
  assert.equal(result.value.trace.constructionRule, "bare-stem-plus-vowel-suffix");
});

test("consonant suffix retains the combining form and preserves doubled rrh", () => {
  const result = generateSingle("beard", "flow", "flow-from", "condition");
  assert.equal(result.ok, true);
  assert.equal(result.value.term, "pogonorrhea");
  assert.match(result.value.term, /rrh/);
  assert.equal(result.value.trace.morphemes[0].surface, "pogono");
  assert.equal(result.value.trace.constructionRule, "combining-form-plus-consonant-suffix");
});

test("definitions display only the English root pair", () => {
  const anatomy = generateSingle("frog", "gland-head", "root-pair", "anatomy");
  const condition = generateSingle("rump", "pain", "pain-of", "condition");
  const process = generateSingle("sponge", "cutting", "cutting-of", "process");
  assert.equal(anatomy.value.definition, "frog gland");
  assert.equal(condition.value.definition, "rump pain");
  assert.equal(process.value.definition, "sponge cutting");
});

test("usage examples are category-specific, interpolated, and randomly selected", () => {
  const cases = [
    ["frog", "gland-head", "root-pair", "anatomy", "batrachoaden",
      'As in "My batrachoaden hurts."',
      'As in "It\'s not a contest, but that might be the largest batrachoaden I\'ve ever seen."'],
    ["sponge", "cutting", "cutting-of", "process", "spongotomy",
      'As in "The process was discovered by spongotomy."',
      'As in "We\'ve significantly improved our spongotomy."'],
    ["rump", "pain", "pain-of", "condition", "pygalgia",
      'As in "I saw a doctor about my pygalgia"',
      'As in "It\'s not as embarrassing as it sounds."'],
  ];

  for (const [leftId, rightId, relation, category, term, firstUsage, secondUsage] of cases) {
    const fixture = subset(leftId, rightId, relation, category);
    const first = generateWord({ ...fixture, rng: rngSequence(0, 0) });
    const second = generateWord({ ...fixture, rng: rngSequence(0, 0.999) });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(first.value.term, term);
    assert.equal(first.value.usage, firstUsage);
    assert.equal(second.value.usage, secondUsage);
  }
});

test("same RNG result is independent of concept and recipe order", () => {
  const forward = generateWord({ lexicon, recipes, rng: () => 0.4375 });
  const reversedData = clone(lexicon);
  reversedData.concepts.reverse();
  const reversed = generateWord({ lexicon: reversedData, recipes: [...recipes].reverse(), rng: () => 0.4375 });
  assert.equal(forward.ok, true);
  assert.equal(reversed.ok, true);
  assert.equal(forward.value.term, reversed.value.term);
  assert.equal(forward.value.trace.recipe.id, reversed.value.trace.recipe.id);
});

test("previous result is excluded when an alternative exists", () => {
  const first = generateWord({ lexicon, recipes: recipes.slice(0, 2), rng: () => 0 });
  const second = generateWord({
    lexicon,
    recipes: recipes.slice(0, 2),
    rng: () => 0,
    previousTerm: first.value.term,
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.notEqual(second.value.term, first.value.term);
});

test("one-result pool remains safe with previous result", () => {
  const fixture = subset("frog", "gland-head", "root-pair", "anatomy");
  const first = generateWord({ ...fixture, rng: () => 0 });
  const second = generateWord({ ...fixture, rng: () => 0.999, previousTerm: first.value.term });
  assert.equal(second.ok, true);
  assert.equal(second.value.term, first.value.term);
});

test("invalid RNG values return a typed failure", () => {
  for (const randomValue of [Number.NaN, Infinity, -0.01, 1]) {
    const result = generateWord({ lexicon, recipes, rng: () => randomValue });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, ERROR_CODES.INVALID_RANDOM_VALUE);
  }

  const fixture = subset("frog", "gland-head", "root-pair", "anatomy");
  const invalidUsageRandom = generateWord({ ...fixture, rng: rngSequence(0, 1) });
  assert.equal(invalidUsageRandom.ok, false);
  assert.equal(invalidUsageRandom.error.code, ERROR_CODES.INVALID_RANDOM_VALUE);
});

test("cross-system, missing-form, and invalid-role concepts fail closed", () => {
  for (const mutate of [
    (concept) => { concept.system = "latin"; },
    (concept) => { delete concept.left.combiningForm; },
    (concept) => { concept.roles = ["modifier"]; },
  ]) {
    const fixture = subset("frog", "gland-head", "root-pair", "anatomy");
    mutate(fixture.lexicon.concepts.find((concept) => concept.id === "frog"));
    const result = generateWord({ ...fixture, rng: () => 0 });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, ERROR_CODES.NO_VALID_COMBINATIONS);
    assert.ok(result.error.issues.some((entry) => entry.code === "INVALID_CONCEPT"));
  }
});

test("blocked output and blocked join fail closed", () => {
  const byOutput = subset("frog", "gland-head", "root-pair", "anatomy");
  byOutput.lexicon.blockedOutputs = ["batrachoaden"];
  const outputResult = generateWord({ ...byOutput, rng: () => 0 });
  assert.equal(outputResult.error.code, ERROR_CODES.NO_VALID_COMBINATIONS);
  assert.ok(outputResult.error.issues.some((entry) => entry.code === "BLOCKED_SURFACE"));

  const byJoin = subset("frog", "gland-head", "root-pair", "anatomy");
  byJoin.lexicon.blockedJoins = ["batracho|aden"];
  const joinResult = generateWord({ ...byJoin, rng: () => 0 });
  assert.equal(joinResult.error.code, ERROR_CODES.NO_VALID_COMBINATIONS);
  assert.ok(joinResult.error.issues.some((entry) => entry.code === "BLOCKED_SURFACE"));
});

test("duplicate rendered surfaces are all removed", () => {
  const fixture = subset("frog", "gland-head", "root-pair", "anatomy");
  const duplicateHead = clone(fixture.lexicon.concepts.find((concept) => concept.id === "gland-head"));
  duplicateHead.id = "other-gland-head";
  fixture.lexicon.concepts.push(duplicateHead);
  fixture.recipes.push({ ...fixture.recipes[0], id: "second-recipe", rightId: "other-gland-head" });
  const result = generateWord({ ...fixture, rng: () => 0 });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, ERROR_CODES.NO_VALID_COMBINATIONS);
  assert.equal(result.error.issues.filter((entry) => entry.code === "DUPLICATE_SURFACE").length, 2);
});

test("missing, empty, and wholly invalid data return typed failures", () => {
  assert.equal(generateWord().error.code, ERROR_CODES.MISSING_LEXICON);
  assert.equal(generateWord({ lexicon, recipes: null }).error.code, ERROR_CODES.MISSING_LEXICON);

  const empty = clone(lexicon);
  empty.concepts = [];
  assert.equal(generateWord({ lexicon: empty, recipes: [], rng: () => 0 }).error.code, ERROR_CODES.NO_VALID_COMBINATIONS);

  const invalid = subset("frog", "gland-head", "root-pair", "anatomy");
  invalid.recipes[0].relation = "nonsense";
  assert.equal(generateWord({ ...invalid, rng: () => 0 }).error.code, ERROR_CODES.NO_VALID_COMBINATIONS);
});

test("trace accounts for the surface and definition claims", () => {
  const result = generateSingle("frog", "gland-head", "root-pair", "anatomy");
  const trace = result.value.trace;
  assert.equal(trace.system.id, lexicon.system.id);
  assert.equal(trace.morphemes.map((morpheme) => morpheme.surface).join(""), result.value.term);
  assert.equal(trace.claims.definitionTemplate, "root-pair");
  assert.equal(trace.claims.leftEnglish, "the frog");
  assert.equal(trace.claims.rightEnglish, "gland");
  assert.deepEqual(trace.confidence, {
    leftOrigin: "high", leftEnglishForm: "high", rightOrigin: "high", rightEnglishForm: "high", recipe: "reviewed",
  });
});

test("enabled outputs never intersect the explicit collision blocklist", () => {
  const { candidates } = enumerateCandidates(lexicon, recipes);
  const blocked = new Set(lexicon.blockedOutputs);
  assert.deepEqual(candidates.filter((candidate) => blocked.has(candidate.term)), []);
  for (const collision of ["glossophobia", "otorrhea", "podophobia", "phlebitis", "cardiophobia", "rhinoscopy", "oxystoma", "platysoma", "batrachitis", "oneirosis"]) {
    assert.ok(blocked.has(collision));
  }
});

test("all glosses display only the encoded English root pair", () => {
  const candidates = enumerateCandidates(lexicon, recipes).candidates;
  assert.ok(candidates.every((candidate) => /^[a-z]+(?: [a-z]+)+$/.test(candidate.definition)));
  assert.ok(candidates.every((candidate) => !/playful|mock|literally|combining|associated with|shaped like/i.test(candidate.definition)));
});

test("concepts separate historical origin from productive English form evidence", () => {
  for (const concept of lexicon.concepts) {
    assert.equal(concept.historicalOrigin.originType, "historical-source");
    assert.ok(concept.historicalOrigin.lemma && concept.historicalOrigin.gloss && concept.historicalOrigin.confidence);
    assert.equal(concept.englishForm.originType, "conventional-english-neoclassical-form");
    assert.ok(concept.englishForm.productiveSense && concept.englishForm.derivationNote && concept.englishForm.confidence);
  }
  assert.ok(lexicon.concepts.some((concept) => concept.englishForm.confidence === "moderate"));
  assert.ok(recipes.every((recipe) => !Object.hasOwn(recipe, "weight")));
});

test("page has the required route structure and accessible controls", async () => {
  const html = await readFile(new URL("../public/scientific-word-generator/index.html", import.meta.url), "utf8");
  assert.match(html, /href="\/css\/style\.css"/);
  assert.match(html, /aria-label="Primary navigation"/);
  assert.match(html, /aria-controls="primary-navigation"/);
  assert.match(html, /id="primary-navigation"/);
  assert.match(html, />Randomize!<\/button>/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /Scientific words are typically combinations of Greek or Latin words/);
  assert.match(html, /This tool lets you create your own scientific words\. Enjoy!/);
  assert.match(html, /id="generated-usage"/);
  assert.match(html, /generated-definition[\s\S]*generated-usage[\s\S]*randomize-word/);
});

test("every standard site navigation links to the word generator", async () => {
  const publicDirectory = new URL("../public/", import.meta.url);
  const entries = await readdir(publicDirectory, { withFileTypes: true });
  for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith(".html"))) {
    const html = await readFile(new URL(entry.name, publicDirectory), "utf8");
    if (html.includes('class="nav-links"')) {
      assert.match(html, /href="\/scientific-word-generator\/"/, entry.name);
    }
  }
});
