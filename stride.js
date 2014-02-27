var EventEmitter = require("events").EventEmitter;

/* Introducing Stride: A [step](https://github.com/creationix/step/)-like
	flow control library for Node.js that makes parallel execution,
	serial execution, and error handling super extra painless.

	Just pass so-called "step" functions to `Stride`, and it will run them:

	```
	Stride(
		function() {
			fs.readFile("foo.txt", this);
		}, function() {
			fs.readFile("bar.txt", this);
		}
	);
	```

	Each step will get `this`, which is the callback that you're
	supposed to call once the step completes.

	`Stride(...)` returns a Node EventEmitter that emits the following:

	"error" - Emitted each time an Error occurs
	"done" - Emitted each time the final `this` callback is called
		(usually only fired once)
*/
function Stride() {
	var steps = [];
	var emitter = new EventEmitter();
	var data = {};
	//Build `steps` array and listen for events
	for(var i = 0; i < arguments.length; i++) {
		switch(arguments[i].name) {
			case "_catch":
				emitter.once("error", arguments[i]);
				break;
			case "_catchAll":
				emitter.on("error", arguments[i]);
				break;
			case "_finally":
				emitter.once("done", arguments[i]);
				break;
			default:
				steps.push(arguments[i]);
				break;
		}
	}
	/* Return the `next()` function specific to a step. */
	function getNext(index) {
		var numCalls = 0,
			maxCalls = Stride.defaultMaxCalls,
			errorRaised = false;
		/* This function is passed as `this` to each step.
			It's purpose is to invoke the next step, passing parameters,
			as necessary.
		*/
		function next(err) {
			if(maxCalls != null && ++numCalls > maxCalls) {
				err = new Error("stride: `this` was called more than " +
					maxCalls + " times!");
			}
			//Process arguments
			if(err) {
				if(EventEmitter.listenerCount(emitter, "error") > 0) {
					process.nextTick(function() {
						emitter.emit("error", err);
					})
				}
				else if(EventEmitter.listenerCount(emitter, "done") == 0)
					process.nextTick(function() {
						throw err; //Throw uncaught exception
					})
				if(!errorRaised)
					emitDone(arguments);
				errorRaised = true;
			}
			if(!errorRaised) {
				//Call the next step
				if(index + 1 < steps.length) {
					//Remove first (error) argument
					var args;
					if(arguments.length > 0) {
						args = new Array(arguments.length - 1);
						for(var j = 0; j < args.length; j++)
							args[j] = arguments[j + 1];
					}
					else
						args = [];
					//Call the next step, catching any errors
					var thisStepsNext = getNext(index + 1);
					try {
						var result = steps[index + 1].apply(thisStepsNext, args);
						//Call next step if this step ran synchronously
						//and returned data
						if(result !== undefined) {
							thisStepsNext(null, result);
						}
					} catch(e) {
						thisStepsNext(e);
					}
				}
				else {
					emitDone(arguments);
				}
			}
		}
		next.canBeCalled = function canBeCalled(numOfTimes) {
			maxCalls = numOfTimes;
			return next;
		};
		var parallelTotal = 0,
			parallelDone = 0,
			parallelArgs = [null];
		/* Break this step into multiple parallel steps.
			The first argument passed to each parallel step's callback must
			be the Error.

			The following `numDataArgs` arguments of each parallel step are
			passed as `numDataArgs` arguments to the next step; thus, the
			number of arguments passed to the next step is equal to the
			number of parallel steps times `numDataArgs`.

			If there is an error in any of the parallel steps, it will
			be raised just like any other error.
		*/
		next.parallel = function(numDataArgs) {
			numDataArgs = numDataArgs || 1;
			//Create closure for argument index
			return (function(index) {
				return function parallel(err, data) {
					//Save the error from the first failed parallel step
					if(err && parallelArgs[0] == null) {
						parallelArgs[0] = err;
					}
					//Save the next `numDataArgs` arguments
					for(var i = 0; i < numDataArgs; i++) {
						parallelArgs[index * numDataArgs + i + 1] =
							arguments[i + 1];
					}
					//When all parallel steps are done...
					if(++parallelDone >= parallelTotal) {
						//Make sure that too many parallel steps didn't execute
						if(parallelDone > parallelTotal)
						{
							parallelArgs[0] = new Error("stride: Parallel step " +
								"callback was called more than " +
								parallelTotal + " times!");
						}
						//Call the next step
						next.apply(null, parallelArgs);
					}
				}
			})(parallelTotal++);
		};
		/* Create a new group of steps. Each group of steps will be
			executed in parallel, just like a `next.parallel()` call.
			The next step will receive an additional argument for each
			`group()` call.  This additional argument will be an Array,
			with each element containing the "second argument" of each
			parallel step in the group.

			For example, consider the following code in a given step:

			```
			var fileGroup = this.group();
			fs.readFile("foo.txt", fileGroup() );
			fs.readFile("bar.txt", fileGroup() );
			```

			The next step will then get one additional argument for the
			`fileGroup`.  This additional argument will be an Array of
			2 elements; the first will contain the contents of `foo.txt`
			and the second element will contain the contents of `bar.txt`.
		*/
		next.group = function(numDataArgs) {
			numDataArgs = numDataArgs || 1;
			var groupCallback = next.parallel(1);
			var groupTotal = 0,
				groupDone = 0,
				groupArgs = [],
				groupError = null;
			/* If there are no group callbacks created before the next
				tick, we just call the `groupCallback` */
			process.nextTick(function() {
				if(groupTotal === 0) {
					groupCallback.call(null, groupError, groupArgs);
				}
			});
			//Return a callback-generating function
			return function parallelGroup() {
				//Create closure for argument index
				return (function(index) {
					//Return a callback
					return function parallelCallback(err, data) {
						//Save the error from the first failed group step
						if(err && groupError == null) {
							groupError = err;
						}
						//Save the next `numDataArgs` arguments
						for(var i = 0; i < numDataArgs; i++) {
							groupArgs[index * numDataArgs + i] =
								arguments[i + 1];
						}
						//When all parallel group steps are done...
						if(++groupDone >= groupTotal) {
							//Make sure that too many group steps didn't execute
							if(groupDone > groupTotal && groupError == null)
							{
								groupError = new Error("stride: Parallel group" +
									"callback was called more than " +
									groupTotal + " times!");
							}
							//Call the `groupCallback`
							groupCallback.call(null, groupError, groupArgs);
						}
					};
				})(groupTotal++);
			};
		}
		/* Some data storage exposed to multiple steps */
		next.data = function dataFunction(key, value) {
			if(arguments.length == 0) {
				return data;
			} else if(arguments.length == 1) {
				return data[key];
			} else {
				data[key] = value;
			}
		};
		next.data.clean = function() {
			data = {};
		};
		return next;
	}
	//Add function to the end to emit "done" event
	function emitDone(rawArgs) {
		if(EventEmitter.listenerCount(emitter, "done") > 0) {
			var args = new Array(rawArgs.length + 1);
			args[0] = "done";
			for(var i = 0; i < rawArgs.length; i++)
				args[i + 1] = rawArgs[i];
			process.nextTick(function() {
				emitter.emit.apply(emitter, args);
			});
		}
	}
	//Run the first step
	process.nextTick(function() {
		getNext(-1)();
	});
	return emitter;
}
Stride.defaultMaxCalls = 1;
module.exports = Stride;
