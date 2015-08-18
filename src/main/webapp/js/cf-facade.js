var cfWorker = new Worker('js/cf-worker.js');

function crossfilter_facade(data, redraw) {
	var cf = {};
	
	if(!redraw) redraw = function() { };
	
	cf.id = "c" + Math.round(Math.random() * 100000);
	
	cfWorker.postMessage(
		{
			type: 'crossfilter_var',
			id: cf.id
		}
	);
	
	cfWorker.listeners = {};
	cfWorker.onmessage = function(e) {
		cfWorker.listeners[e.data.return_id](e);
	}
	
	cf.dimension = function(accessor) {
    
		var dim = {};
		
		dim.id = "d" + Math.round(Math.random() * 100000);
		
		cfWorker.postMessage(
			{
				type: 'var_method_function',
				id: cf.id,
				method: 'dimension',
				func: accessor.toString(),
				newId: dim.id
			}
		);
		
		dim.group = function(accessor) {
			var grp = {};
			
			grp.id = "g" + Math.round(Math.random() * 100000);
			
			if(accessor) {
				cfWorker.postMessage(
					{
						type: 'var_method_function',
						id: dim.id,
						method: 'group',
						func: accessor.toString(),
						newId: grp.id
					}
				);	
			} else {
				cfWorker.postMessage({
					type: 'var_methods',
					id: dim.id,
					newId: grp.id,
					methods: [
						{
							method: 'group',
							args: []
						}
					]
				});
			}
			
			// Return the cached value immediately and then
			// trigger a redraw when we get a new value.
			// Susceptible to race conditions. We need a full
			// dispatcher with random method call ids.
			var cached_grp_all = []
			var cached_grp_all_id = Math.round(Math.random() * 1000000);
			cfWorker.listeners[cached_grp_all_id] = function(e) {
				if(JSON.stringify(cached_grp_all) !== JSON.stringify(e.data)) {
					cached_grp_all = e.data;
					redraw();
				}
			};
			grp.all = function() {		
				cfWorker.postMessage({
					type: 'var_method_return',
					id: grp.id,
					return_id: cached_grp_all_id,
					method: 'all'
				});
				
				return cached_grp_all;
			}
			
			var cached_grp_top = []
			var cached_grp_top_id = Math.round(Math.random() * 1000000);
			cfWorker.listeners[cached_grp_top_id] = function(e) {
				if(JSON.stringify(cached_grp_top) !== JSON.stringify(e.data)) {
					cached_grp_top = e.data;
					redraw();
				}
			};
			grp.top = function(num) {
				cfWorker.postMessage({
					type: 'var_method_return',
					id: grp.id,
					return_id: cached_grp_top_id,
					method: 'top',
					arg: Infinity
				});
				
				return cached_grp_top.slice(0,num);
			}
			
			grp.reduceSum = function(accessor) {
				cfWorker.postMessage(
					{
						type: 'var_method_function',
						id: grp.id,
						method: 'reduceSum',
						func: accessor.toString()
					}
				);
				
				return grp;
			}
			
			grp.order = function(accessor) {
				cfWorker.postMessage(
					{
						type: 'var_method_function',
						id: grp.id,
						method: 'order',
						func: accessor.toString()
					}
				);
				
				return grp;
			}
			
			grp.dispose = function() {
				cfWorker.postMessage({
					type: 'var_methods',
					id: grp.id,
					methods: [
						{
							method: 'dispose',
							args: []
						}
					]
				});
				
				return grp;
			}
			
			return grp;
		}
		
		var cached_top_value = [];
		var cached_top_value_id = Math.round(Math.random() * 1000000);
		dim.top = function(num) {
			cfWorker.listeners[cached_top_value_id] = function(e) {
				if(cached_top_value.length !== e.data.length) {
					cached_top_value = e.data;
					redraw();	
				}
			};
			
			cfWorker.postMessage({
				type: 'var_method_return',
				id: dim.id,
				method: 'top',
				return_id: cached_top_value_id,
				arg: Infinity
			});
			
			return cached_top_value.slice(0,num);
		}
		
		dim.filter = function(filt) {
			cfWorker.postMessage({
				type: 'var_methods',
				id: dim.id,
				methods: [
					{
						method: 'filter',
						args: [filt]
					}
				]
			});
			
			console.log("dim.filter");
			redraw();
			return dim;
		}
		
		dim.dispose = function() {
			cfWorker.postMessage({
				type: 'var_methods',
				id: dim.id,
				methods: [
					{
						method: 'dispose',
						args: []
					}
				]
			});
			
			console.log("dim.dispose");
			redraw();
		}
		
		dim.filterFunction = function(filterFunc, eval_context) {
			cfWorker.postMessage(
				{
					type: 'var_method_function',
					id: dim.id,
					method: 'filterFunction',
					context: eval_context,
					func: filterFunc.toString()
				}
			);
			
			console.log("dim.filterFunction");
			redraw();
			return dim;
		}
		
		dim.filterExact = function(filt) {
			console.log("dim.filterExact");
		}
		
		return dim;
	}
	
	cf.groupAll = function() {
		var ga = {};
		
		ga.id = 'ga' + Math.round(Math.random() * 100000);
		
		cfWorker.postMessage({
			type: 'var_methods',
			id: cf.id,
			newId: ga.id,
			methods: [
				{
					method: 'groupAll',
					args: []
				}
			]
		});
		
		var cached_ga_value = [];
		var cached_ga_value_id = Math.round(Math.random() * 1000000);
		cfWorker.listeners[cached_ga_value_id] = function(e) {
			if(JSON.stringify(cached_ga_value) !== JSON.stringify(e.data)) {
				cached_ga_value = e.data;
				redraw();	
			}
		};
		ga.value = function() {
			cfWorker.postMessage({
				type: 'var_method_return',
				id: ga.id,
				return_id: cached_ga_value_id,
				method: 'value'
			});
			
			return cached_ga_value;
		}
		
		return ga;
	}
	
	cf.add = function(arr) {
		cfWorker.postMessage({
			type: 'var_methods',
			id: cf.id,
			methods: [
				{
					method: 'add',
					args: [arr]
				}
			]
		});
	}
	
	var cached_size_value = 0;
	var cached_size_value_id = Math.round(Math.random() * 1000000);
	cf.size = function() {
		cfWorker.listeners[cached_size_value_id] = function(e) {
			if(cached_size_value !== e.data.data) {
				cached_size_value = e.data.data;
				redraw();	
			}
		};
		
		cfWorker.postMessage({
			type: 'var_unstructured_method_return',
			id: cf.id,
			return_id: cached_size_value_id,
			method: 'size'
		});
		
		return cached_size_value;
	}
	
	cf.remove = function(accessor) {
		if(accessor) {
			cfWorker.postMessage(
				{
					type: 'var_method_function',
					id: cf.id,
					method: 'remove',
					func: accessor.toString()
				}
			);	
		} else {
			cfWorker.postMessage({
				type: 'var_methods',
				id: cf.id,
				methods: [
					{
						method: 'remove',
						args: []
					}
				]
			});
		}
	}
	
	return cf;
}

function reductio_facade() {
	var red = function(cf_facade_group) {
		cfWorker.postMessage({
			type: 'call_var_on_var',
			callFunc: red.id,
			arg: cf_facade_group.id
		});
	};
	
	red.id = "r" + Math.round(Math.random() * 100000);
	
	cfWorker.postMessage({ type: 'reductio_var', id: red.id });
	
	red.value = function(name) {
		var value = {};
		value.id = "v" + Math.round(Math.random() * 100000);
		
		cfWorker.postMessage({ 
			type: 'var_methods', 
			id: red.id,
			newId: value.id,
			methods: [
				{
					method: 'value',
					args: [name]
				}
			]
		});
		
		value.sum = function(accessor) {
			cfWorker.postMessage({ 
				type: 'var_methods', 
				id: value.id,
				methods: [
					{
						method: 'sum',
						args: [accessor]
					}
				]
			});
			
			return value;
		}
		
		return value;
	}
	
	red.groupAll = function(accessor) {
		var rga = function(cf_facade_group) {
			cfWorker.postMessage({
				type: 'call_var_on_var',
				callFunc: rga.id,
				arg: cf_facade_group.id
			});
		};
		rga.id = "rga" + Math.round(Math.random() * 100000);
		
		cfWorker.postMessage({
			type: 'var_method_function',
			id: red.id,
			method: 'groupAll',
			newId: rga.id,
			func: accessor.toString()
		});
		
		rga.count = function(bool) {
			cfWorker.postMessage({
				type: 'var_methods',
				id: rga.id,
				methods: [
					{
						method: 'count',
						args: [bool]
					}
				]
			});
			
			return rga;
		};
		
		rga.sum = function(accessor) {
			cfWorker.postMessage({
				type: 'var_methods',
				id: rga.id,
				methods: [
					{
						method: 'sum',
						args: [accessor]
					}
				]
			});
			
			return rga;
		};
		
		return rga;
	}
	
	return red;
}