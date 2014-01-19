stride
======

A step-like flow control library for Node.js that makes parallel execution, serial execution, and error handling super extra painless

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
);
```

Unlike Step, errors will not get passed to the next step.  Instead,
errors are emitted from the Stride EventEmitter.  `Stride(...)` returns
a Node EventEmitter that emits the following:

"error" - Emitted each time an Error occurs
"done" - Emitted each time the final `this` callback is called
	(usually only fired once)

Each step will get `this`, which is the callback that you're
supposed to call once the step completes.

You can also call `this.parallel()` to create a parallel callback,
just like in Step.  And, of course, you can call `this.group()`
just like in Step.

API available to each step:

- `this(err, data1, data2, ...)` is called to complete the step
- `this.canBeCalled(num)` can be used to specify the maximum number of
 	times `this()` can be called in a given step. By default, a step can
	only call `this()` once.  Calling `this()` too many times will cause
	Stride to emit an Error.
- `this.parallel()` can be used to create a parallel callback
- `var group1 = this.group()` can be used to create a `Group` of steps.
	You can call `group1()` to create a parallel callback for that `Group`.
- `this.data(key, value)` can be used to store data
- `this.data(key)` can be used to retrieve the data later
- `this.data.clean()` can be used to delete all data
