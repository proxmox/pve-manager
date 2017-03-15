Ext.define('PVE.grid.ResourceGrid', {
    extend: 'Ext.grid.GridPanel',
    alias: ['widget.pveResourceGrid'],

    border: false,
    defaultSorter: {
	property: 'type',
	direction: 'ASC'
    },
    initComponent : function() {
	var me = this;

	var rstore = PVE.data.ResourceStore;
	var sp = Ext.state.Manager.getProvider();

	var coldef = rstore.defaultColumns();

	var store = Ext.create('Ext.data.Store', {
	    model: 'PVEResources',
	    sorters: me.defaultSorter,
	    proxy: { type: 'memory' }
	});

	var textfilter = '';

	var textfilter_match = function(item) {
	    var match = false;
	    Ext.each(['name', 'storage', 'node', 'type', 'text'], function(field) {
		var v = item.data[field];
		if (v !== undefined) {
		    v = v.toLowerCase();
		    if (v.indexOf(textfilter) >= 0) {
			match = true;
			return false;
		    }
		}
	    });
	    return match;
	};

	var updateGrid = function() {

	    var filterfn = me.viewFilter ? me.viewFilter.filterfn : null;
	    
	    //console.log("START GRID UPDATE " +  me.viewFilter);

	    store.suspendEvents();

	    var nodeidx = {};
	    var gather_child_nodes = function(cn) {
		if (!cn) {
		    return;
		}
                var cs = cn.childNodes;
		if (!cs) {
		    return;
		}
		var len = cs.length, i = 0, n, res;

                for (; i < len; i++) {
		    var child = cs[i];
		    var orgnode = rstore.data.get(child.data.id);
		    if (orgnode) {
			if ((!filterfn || filterfn(child)) &&
			    (!textfilter || textfilter_match(child))) {
			    nodeidx[child.data.id] = orgnode;
			}
		    }
		    gather_child_nodes(child);
		}
	    };
	    gather_child_nodes(me.pveSelNode);

	    // remove vanished items
	    var rmlist = [];
	    store.each(function(olditem) {
		var item = nodeidx[olditem.data.id];
		if (!item) {
		    //console.log("GRID REM UID: " + olditem.data.id);
		    rmlist.push(olditem);
		}
	    });

	    if (rmlist.length) {
		store.remove(rmlist);
	    }

	    // add new items
	    var addlist = [];
	    var key;
	    for (key in nodeidx) {
		if (nodeidx.hasOwnProperty(key)) {
		    var item = nodeidx[key];
		
		    // getById() use find(), which is slow (ExtJS4 DP5) 
		    //var olditem = store.getById(item.data.id);
		    var olditem = store.data.get(item.data.id);

		    if (!olditem) {
			//console.log("GRID ADD UID: " + item.data.id);
			var info = Ext.apply({}, item.data);
			var child = Ext.create(store.model, info);
			addlist.push(item);
			continue;
		    }
		    // try to detect changes
		    var changes = false;
		    var fieldkeys = PVE.data.ResourceStore.fieldNames;
		    var fieldcount = fieldkeys.length;
		    var fieldind;
		    for (fieldind = 0; fieldind < fieldcount; fieldind++) {
			var field = fieldkeys[fieldind];
			if (field != 'id' && item.data[field] != olditem.data[field]) {
			    changes = true;
			    //console.log("changed item " + item.id + " " + field + " " + item.data[field] + " != " + olditem.data[field]);
			    olditem.beginEdit();
			    olditem.set(field, item.data[field]);
			}
		    }
		    if (changes) {
			olditem.endEdit(true);
			olditem.commit(true); 
		    }
		}
	    }

	    if (addlist.length) {
		store.add(addlist);
	    }

	    store.sort();

	    store.resumeEvents();

	    store.fireEvent('refresh', store);

	    //console.log("END GRID UPDATE");
	};

	var filter_task = new Ext.util.DelayedTask(function(){
	    updateGrid();
	});

	var load_cb = function() { 
	    updateGrid(); 
	};

	Ext.apply(me, {
	    store: store,
	    stateful: true,
	    stateId: 'grid-resource',
	    tbar: [
		'->', 
		gettext('Search') + ':', ' ',
		{
		    xtype: 'textfield',
		    width: 200,
		    value: textfilter,
		    enableKeyEvents: true,
		    listeners: {
			keyup: function(field, e) {
			    var v = field.getValue();
			    textfilter = v.toLowerCase();
			    filter_task.delay(500);
			}
		    }
		}
	    ],
	    viewConfig: {
		stripeRows: true
            },
	    listeners: {
		itemcontextmenu: PVE.Utils.createCmdMenu,
		itemdblclick: function(v, record) {
		    var ws = me.up('pveStdWorkspace');
		    ws.selectById(record.data.id);
		},
		destroy: function() {
		    rstore.un("load", load_cb);
		}
	    },
            columns: coldef
	});
	me.callParent();
	updateGrid();
	rstore.on("load", load_cb);
    }
});
