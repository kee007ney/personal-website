const ERROR_CODES = Object.freeze({
  MISSING_LEXICON: "MISSING_LEXICON",
  NO_VALID_COMBINATIONS: "NO_VALID_COMBINATIONS",
  INVALID_RANDOM_VALUE: "INVALID_RANDOM_VALUE",
});

const ALLOWED_CATEGORIES = new Set(["anatomy", "condition", "process"]);
const ALLOWED_ROLES = new Set(["left", "right"]);
const ALLOWED_ATTACHMENTS = new Set(["root", "vowel-suffix", "consonant-suffix"]);
const RELATIONS = {
  anatomy: new Set(["root-pair"]),
  condition: new Set(["pain-of", "inflammation-of", "condition-of", "flow-from", "fear-of"]),
  process: new Set(["eating-of", "loosening-of", "cutting-of", "viewing-of", "reshaping-of"]),
};

function issue(code, record, detail) {
  return { code, record, detail };
}

function canonicalRecipeKey(recipe) {
  const override = recipe.joinOverride
    ? `${recipe.joinOverride.surface || ""}:${recipe.joinOverride.note || ""}`
    : "";
  return [
    recipe.system,
    recipe.category,
    recipe.leftId,
    recipe.rightId,
    recipe.relation,
    override,
    recipe.id,
  ].join("|");
}

function hasOnlyAllowedRoles(roles) {
  return Array.isArray(roles)
    && roles.length > 0
    && roles.every((role) => ALLOWED_ROLES.has(role));
}

function validateConcept(concept, systemId, duplicateIds) {
  if (!concept || typeof concept !== "object" || typeof concept.id !== "string") return "invalid concept record";
  if (duplicateIds.has(concept.id)) return "duplicate concept id";
  if (concept.system !== systemId) return "concept belongs to a different naming system";
  if (!hasOnlyAllowedRoles(concept.roles)) return "concept has an invalid role";
  if (!concept.editorial?.enabled || concept.editorial?.reviewed !== true) return "concept is not editorially enabled and reviewed";
  if (!["low", "moderate"].includes(concept.safety?.risk)) return "concept safety risk is not allowed";
  if (!concept.english?.singular || !concept.english?.dependent) return "concept is missing English grammar forms";
  if (!concept.historicalOrigin?.lemma || !concept.historicalOrigin?.script
      || !concept.historicalOrigin?.romanization || !concept.historicalOrigin?.gloss
      || !concept.historicalOrigin?.originType || !concept.historicalOrigin?.confidence
      || !concept.historicalOrigin?.note) {
    return "concept is missing historical-origin evidence";
  }
  if (!concept.englishForm?.originType || !concept.englishForm?.productiveSense
      || !concept.englishForm?.confidence || !concept.englishForm?.derivationNote) {
    return "concept is missing English-form evidence";
  }
  if (!Array.isArray(concept.categories) || !concept.categories.every((category) => ALLOWED_CATEGORIES.has(category))) {
    return "concept has an invalid category";
  }
  if (concept.roles.includes("left")
      && (!concept.left?.bareStem || !concept.left?.combiningForm
        || !/^[a-z]+$/.test(concept.left.bareStem)
        || !/^[a-z]+$/.test(concept.left.combiningForm))) {
    return "left concept is missing a stored form";
  }
  if (concept.roles.includes("right")
      && (!concept.right?.text || !/^[a-z]+$/.test(concept.right.text)
        || !ALLOWED_ATTACHMENTS.has(concept.right.attachment))) {
    return "right concept is missing a valid stored form";
  }
  return null;
}

function validateRecipe(recipe, systemId, concepts, duplicateRecipeKeys) {
  if (!recipe || typeof recipe !== "object" || typeof recipe.id !== "string") return "invalid recipe record";
  if (recipe.system !== systemId) return "recipe belongs to a different naming system";
  if (duplicateRecipeKeys.has(canonicalRecipeKey({ ...recipe, id: "" }))) return "duplicate recipe pairing";
  if (!ALLOWED_CATEGORIES.has(recipe.category) || !RELATIONS[recipe.category]?.has(recipe.relation)) {
    return "recipe has an invalid category or relation";
  }
  if (recipe.quality !== "reviewed") {
    return "recipe is not reviewed";
  }
  if (recipe.joinOverride !== null && recipe.joinOverride !== undefined
      && (!/^[a-z]{5,30}$/.test(recipe.joinOverride.surface || "") || !recipe.joinOverride.note)) {
    return "join override is undocumented or malformed";
  }
  const left = concepts.get(recipe.leftId);
  const right = concepts.get(recipe.rightId);
  if (!left || !right) return "recipe references a missing or invalid concept";
  if (!left.roles.includes("left") || !right.roles.includes("right")) return "recipe references a concept in the wrong role";
  if (!left.categories.includes(recipe.category) || !right.categories.includes(recipe.category)) {
    return "recipe category is not supported by both concepts";
  }
  return null;
}

function constructSurface(left, right, override) {
  if (override) {
    return { term: override.surface, leftSurface: null, rightSurface: null, rule: "documented-override" };
  }
  const attachment = right.right.attachment;
  const leftSurface = attachment === "vowel-suffix" ? left.left.bareStem : left.left.combiningForm;
  const rule = attachment === "root"
    ? "combining-form-plus-root"
    : attachment === "vowel-suffix"
      ? "bare-stem-plus-vowel-suffix"
      : "combining-form-plus-consonant-suffix";
  return {
    term: leftSurface + right.right.text,
    leftSurface,
    rightSurface: right.right.text,
    rule,
  };
}

function definitionFor(recipe, left, right) {
  const leftSense = left.englishForm.productiveSense;
  const head = right.englishForm.productiveSense;
  return `${leftSense} ${head}`;
}

const USAGE_TEMPLATES = {
  anatomy: [
    (term) => `My ${term} hurts.`,
    (term) => `It's not a contest, but that might be the largest ${term} I've ever seen.`,
  ],
  process: [
    (term) => `The process was discovered by ${term}.`,
    (term) => `We've significantly improved our ${term}.`,
  ],
  condition: [
    (term) => `I saw a doctor about my ${term}`,
    () => "It's not as embarrassing as it sounds.",
  ],
};

function readRandom(rng) {
  try {
    return rng();
  } catch {
    return Number.NaN;
  }
}

function usageFor(category, term, randomValue) {
  const templates = USAGE_TEMPLATES[category];
  return `As in "${templates[Math.floor(randomValue * templates.length)](term)}"`;
}

export function enumerateCandidates(lexicon, recipes) {
  const issues = [];
  if (!lexicon?.system?.id || !Array.isArray(lexicon.concepts) || !Array.isArray(recipes)) {
    return { candidates: [], issues: [issue("MISSING_DATA", "lexicon", "Naming system, concepts, and recipes are required.")] };
  }

  const idCounts = new Map();
  for (const concept of lexicon.concepts) {
    if (typeof concept?.id === "string") idCounts.set(concept.id, (idCounts.get(concept.id) || 0) + 1);
  }
  const duplicateIds = new Set([...idCounts].filter(([, count]) => count > 1).map(([id]) => id));
  const concepts = new Map();
  for (const concept of lexicon.concepts) {
    const problem = validateConcept(concept, lexicon.system.id, duplicateIds);
    if (problem) {
      issues.push(issue("INVALID_CONCEPT", concept?.id || "unknown", problem));
    } else {
      concepts.set(concept.id, concept);
    }
  }

  const recipeKeyCounts = new Map();
  for (const recipe of recipes) {
    if (!recipe || typeof recipe !== "object") continue;
    const key = canonicalRecipeKey({ ...recipe, id: "" });
    recipeKeyCounts.set(key, (recipeKeyCounts.get(key) || 0) + 1);
  }
  const duplicateRecipeKeys = new Set([...recipeKeyCounts].filter(([, count]) => count > 1).map(([key]) => key));
  const blockedOutputs = new Set(lexicon.blockedOutputs || []);
  const blockedJoins = new Set(lexicon.blockedJoins || []);
  const provisional = [];

  for (const recipe of recipes) {
    const problem = validateRecipe(recipe, lexicon.system.id, concepts, duplicateRecipeKeys);
    if (problem) {
      issues.push(issue("INVALID_RECIPE", recipe?.id || "unknown", problem));
      continue;
    }
    const left = concepts.get(recipe.leftId);
    const right = concepts.get(recipe.rightId);
    const surface = constructSurface(left, right, recipe.joinOverride);
    const joinKey = `${surface.leftSurface}|${surface.rightSurface}`;
    if (!/^[a-z]{5,30}$/.test(surface.term)) {
      issues.push(issue("INVALID_SURFACE", recipe.id, "Rendered surface must be 5–30 lowercase ASCII letters."));
      continue;
    }
    if (blockedOutputs.has(surface.term) || blockedJoins.has(joinKey)) {
      issues.push(issue("BLOCKED_SURFACE", recipe.id, "Rendered output or join is editorially blocked."));
      continue;
    }
    const definition = definitionFor(recipe, left, right);
    if (!definition) {
      issues.push(issue("INVALID_DEFINITION", recipe.id, "No approved definition template exists."));
      continue;
    }
    provisional.push({
      key: canonicalRecipeKey(recipe),
      term: surface.term,
      category: recipe.category,
      definition,
      trace: {
        system: { id: lexicon.system.id, name: lexicon.system.name },
        recipe: {
          id: recipe.id,
          relation: recipe.relation,
          category: recipe.category,
          quality: recipe.quality,
        },
        morphemes: [
          {
            role: "dependent-left",
            conceptId: left.id,
            surface: surface.leftSurface,
            storedForms: { ...left.left },
            historicalOrigin: { ...left.historicalOrigin },
            englishForm: { ...left.englishForm },
          },
          {
            role: "semantic-head-right",
            conceptId: right.id,
            surface: surface.rightSurface,
            storedForm: { ...right.right },
            historicalOrigin: { ...right.historicalOrigin },
            englishForm: { ...right.englishForm },
          },
        ],
        constructionRule: surface.rule,
        confidence: {
          leftOrigin: left.historicalOrigin.confidence,
          leftEnglishForm: left.englishForm.confidence,
          rightOrigin: right.historicalOrigin.confidence,
          rightEnglishForm: right.englishForm.confidence,
          recipe: recipe.quality,
        },
        claims: {
          definitionTemplate: recipe.relation,
          leftEnglish: left.english.dependent,
          rightEnglish: right.english.singular,
          editorialFrame: recipe.category === "condition" ? "mock condition" : "playful coinage",
        },
      },
    });
  }

  const surfaceCounts = new Map();
  provisional.forEach((candidate) => surfaceCounts.set(candidate.term, (surfaceCounts.get(candidate.term) || 0) + 1));
  const candidates = provisional
    .filter((candidate) => {
      if (surfaceCounts.get(candidate.term) === 1) return true;
      issues.push(issue("DUPLICATE_SURFACE", candidate.trace.recipe.id, `Duplicate rendered surface: ${candidate.term}`));
      return false;
    })
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  return { candidates, issues };
}

export function generateWord({ lexicon, recipes, rng = Math.random, previousTerm = null } = {}) {
  if (!lexicon || !recipes) {
    return {
      ok: false,
      error: { code: ERROR_CODES.MISSING_LEXICON, issues: [] },
    };
  }

  const { candidates, issues } = enumerateCandidates(lexicon, recipes);
  if (candidates.length === 0) {
    return {
      ok: false,
      error: { code: ERROR_CODES.NO_VALID_COMBINATIONS, issues },
    };
  }

  const randomValue = readRandom(rng);
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
    return {
      ok: false,
      error: { code: ERROR_CODES.INVALID_RANDOM_VALUE, issues: [] },
    };
  }

  const eligible = candidates.length > 1 && previousTerm
    ? candidates.filter((candidate) => candidate.term !== previousTerm)
    : candidates;
  const pool = eligible.length > 0 ? eligible : candidates;
  const selected = pool[Math.floor(randomValue * pool.length)];
  const usageRandomValue = readRandom(rng);
  if (!Number.isFinite(usageRandomValue) || usageRandomValue < 0 || usageRandomValue >= 1) {
    return {
      ok: false,
      error: { code: ERROR_CODES.INVALID_RANDOM_VALUE, issues: [] },
    };
  }
  return {
    ok: true,
    value: { ...selected, usage: usageFor(selected.category, selected.term, usageRandomValue) },
  };
}

export { ERROR_CODES };
