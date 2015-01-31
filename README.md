stride
======

A step-like flow control library for Node.js that makes parallel execution, serial execution, and error handling super extra painless

Why
---

[Step](https://github.com/creationix/step/) is a really great flow
control library for Node.js, but I wasn't a big fan of how errors were
handled.  Writing `if(err) throw err;` at the beginning of each step
function was getting annoying.  I wanted a library that handled errors
in one place, so I wrote my own.

Usage
-----

Introducing Stride: A [Step](https://github.com/creationix/step/)-like
flow control library for Node.js that makes parallel execution,
serial execution, and error handling super extra painless.

Just pass so-called "step" functions to `Stride`, and it will run them:

```
Stride(
	function step1() {
		fs.readFile("foo.txt", this);
	}, function step2(contentsOfFoo) {
		fs.readFile("bar.txt", this);
	}
).once("done", function(err, contentsOfBar) {
	if(err)
		console.error(err);
});
```

Unlike Step, errors do not get passed to the next step.  Instead,
errors are emitted from the Stride EventEmitter.  `Stride(...)` returns
a Node EventEmitter that emits the following:

- "error" - Emitted each time an Error occurs
- "done" - Emitted each time the final `this` callback is called
	(usually only fired once) or the first time an Error occurs

Each step will get `this`, which is the callback that you're
supposed to call once the step completes.

You can also call `this.parallel()` to create a parallel callback,
just like in Step.  And, of course, you can call `this.group()`
just like in Step.

If an error occurs, Stride will not proceed to the next step.

API available to each step:

- `this(err, data1, data2, ...)` is called to complete the step
- `this.canBeCalled(num)` can be used to specify the maximum number of
 times `this()` can be called in a given step. By default, a step can
only call `this()` once.  Calling `this()` too many times will cause
Stride to emit an Error.
- `this.parallel()` can be used to create a parallel callback.  Once all
parallel callbacks complete, Stride will pass their second argument (the
first argument is the Error) to the next step.  If there are multiple parallel
callbacks, the next step will receive multiple arguments.
- `var group1 = this.group()` can be used to create a `Group` of steps.
  You can call `group1()` to create a parallel callback for that `Group`.
  Once all parallel callbacks for all Groups are complete, Stride will pass
  each of the parallel callbacks' second arguments as an Array to the next
  step.  If there are multiple Groups, the next step will receive multiple
  arguments.
- `this.data(key, value)` can be used to store data
- `this.data(key)` can be used to retrieve the data later, even from another step
- `this.data.clean()` can be used to delete all data

Examples
--------

Print the contents of all *.js files in this file's directory.
```javascript
Stride(
	function readDir() {
		fs.readdir(__dirname, this);
	},
	function readFiles(results) {
		// Create a new group
		var group = this.group();
		results.forEach(function (filename) {
			if (/\.js$/.test(filename)) {
				fs.readFile(__dirname + "/" + filename, 'utf8', group());
			}
		});
	}
).once("done", function(err, contents) {
	// If an error occurs during any step, we just handle the error here and abort.
	if(err) {
		console.error(err);
	} else {
		console.dir(files);
	}
});
```

A contrived example denomstrating that you can mix `this.parallel()` and `this.group()` calls.
Each call results in one additional argument getting passed to the next step function, or
in this case, to the "done" event handler.
```javascript
Stride(
	function readDir() {
		fs.readdir(__dirname, this);
	},
	function readFiles(results) {
		// Create a new group
		var group = this.group();
		results.forEach(function (filename) {
			if (/\.js$/.test(filename)) {
				fs.readFile(__dirname + "/" + filename, 'utf8', group());
			}
		});
		// There should be at least a 1 second delay before calling the next step
		setTimeout(this.parallel().bind(null, null, "Timer string"), 1000);
		
	}
).once("done", function(err, contents, str) {
	// If an error occurs during any step, we just handle the error here and abort.
	if(err) {
		console.error(err);
	} else {
		console.dir(contents);
		console.log(str === "Timer string");
	}
});
```
