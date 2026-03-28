/**
 * User-related constants.
 */

const PERSON_TYPE_LIST = ["private", "legal"];

const PERSON_TYPE = Object.fromEntries(PERSON_TYPE_LIST.map((s) => [s.toUpperCase(), s]));

module.exports = {
  PERSON_TYPE_LIST,
  PERSON_TYPE,
};
