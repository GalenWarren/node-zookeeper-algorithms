//require('babel-core/register');
require('babel-polyfill');

var gulp = require('gulp');
var eslint = require('gulp-eslint');
var mocha = require('gulp-mocha');
var watch = require('gulp-watch');
var util = require('gulp-util');
var jsdoc = require('gulp-jsdoc3');
var babel = require('gulp-babel');
var istanbul = require('gulp-babel-istanbul');
var injectModules = require('gulp-inject-modules');

gulp.task('doc', callback => {
  gulp.src(['README.md', 'src/**/*.js'], {read: false})
    .pipe(jsdoc({
      opts: {
        destination: './docs'
      },
      plugins: [
        'plugins/markdown',
        'node_modules/jsdoc-strip-async-await'
      ]
    }, callback));
});

gulp.task('lint', ['doc'], () => {
  return gulp.src('src/**/*.js')
    .pipe(eslint('.eslintrc.json'))
    .pipe(eslint.format())
    .pipe(eslint.failAfterError());
});

gulp.task('test', ['lint'], (cb) => {
  gulp.src('src/**/*.js')
  .pipe(istanbul())
  .pipe(injectModules())
  .on('finish', () => {
    gulp.src('test/**/*.js')
    .pipe(babel())
    .pipe(injectModules())
    .pipe(mocha({reported: 'nyan'}))
    .pipe(istanbul.writeReports())
    .on('end', cb);
  });
});

gulp.task('test:watch', ['test'], () => {
  return gulp.watch(['src/**/*.js', 'test/**/*.spec.js'], ['test']);
});
