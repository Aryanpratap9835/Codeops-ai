import {
    shouldIgnore,
    shouldTake
} from "./core/repository/file-filter.js";

console.log(shouldIgnore("node_modules")); // true
console.log(shouldIgnore("src"));          // false

console.log(shouldTake("index.ts"));       // true
console.log(shouldTake("main.py"));        // true
console.log(shouldTake("image.png"));      // false
console.log(shouldTake("package.json"));   // false