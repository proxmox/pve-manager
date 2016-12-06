/*
 *  This is a global search field
 *  it loads the /cluster/resources on focus
 *  and displays the result in a floating grid
 *
 *  it filters and sorts the objects by the algorithm in
 *  the customFilter function
 *
 *  also it does accept key up/down and enter for input
 *  and it opens to ctrl+shift+f and ctrl+space
 */
Ext.define('PVE.form.GlobalSearchField', {
    extend: 'Ext.form.field.Text',
    alias: 'widget.pveGlobalSearchField',

    emptyText: gettext('Search'),
    enableKeyEvents: true,
    selectOnFocus: true,
    padding: '0 5 0 5',

    grid: {
	xtype: 'gridpanel',
	focusOnToFront: false,
	floating: true,
	emptyText: PVE.Utils.noneText,
	width: 600,
	height: 400,
	scrollable: {
	    xtype: 'scroller',
	    y: true,
	    x:false
	},
	store: {
	    model: 'PVEResources',
	    proxy:{
		type: 'pve',
		url: '/api2/extjs/cluster/resources'
	    }
	},
	plugins: {
	    ptype: 'bufferedrenderer',
	    trailingBufferZone: 20,
	    leadingBufferZone: 20
	},

	hideMe: function() {
	    var me = this;
	    me.hasFocus = false;
	    if (!me.textfield.hasFocus) {
		me.hide();
	    }
	},

	setFocus: function() {
	    var me = this;
	    me.hasFocus = true;
	},

	listeners: {
	    rowclick: function(grid, record) {
		var me = this;
		me.textfield.selectAndHide(record.id);
	    },
	    /* because of lint */
	    focusleave: {
		fn: 'hideMe'
	    },
	    focusenter: 'setFocus'
	},

	columns: [
	    {
		text: gettext('Type'),
		dataIndex: 'type',
		width: 100,
		renderer: PVE.Utils.render_resource_type
	    },
	    {
		text: gettext('Description'),
		flex: 1,
		dataIndex: 'text'
	    },
	    {
		text: gettext('Node'),
		dataIndex: 'node'
	    },
	    {
		text: gettext('Pool'),
		dataIndex: 'pool'
	    }
	]
    },

    customFilter: function(item) {
	var me = this;
	var match = 0;
	var fieldArr = [];
	var i,j, fields;

	// different types of objects have different fields to search
	// for example, a node will never have a pool and vice versa
	switch (item.data.type) {
	    case 'pool': fieldArr = ['type', 'pool', 'text']; break;
	    case 'node': fieldArr = ['type', 'node', 'text']; break;
	    case 'storage': fieldArr = ['type', 'pool', 'node', 'storage']; break;
	    default: fieldArr = ['name', 'type', 'node', 'pool', 'vmid'];
	}
	if (me.filterVal === '') {
	    item.data.relevance = 0;
	    return true;
	}

	// all text is case insensitive and each word is
	// searched alone
	// for every partial match, the row gets
	// 1 match point, for every exact match
	// it gets 2 points
	//
	// results gets sorted by points (descending)
	fields = me.filterVal.split(/\s+/);
	for(i = 0; i < fieldArr.length; i++) {
	    var v = item.data[fieldArr[i]];
	    if (v !== undefined) {
		v = v.toString().toLowerCase();
		for(j = 0; j < fields.length; j++) {
		    if (v.indexOf(fields[j]) !== -1) {
			match++;
			if(v === fields[j]) {
			    match++;
			}
		    }
		}
	    }
	}
	// give the row the 'relevance' value
	item.data.relevance = match;
	return (match > 0);
    },

    updateFilter: function(field, newValue, oldValue) {
	var me = this;
	// parse input and filter store,
	// show grid
	me.grid.store.filterVal = newValue.toLowerCase().trim();
	me.grid.store.clearFilter(true);
	me.grid.store.filterBy(me.customFilter);
	me.grid.getSelectionModel().select(0);
    },

    selectAndHide: function(id) {
	var me = this;
	me.tree.selectById(id);
	me.grid.hide();
	me.setValue('');
	me.blur();
    },

    onKey: function(field, e) {
	var me = this;
	var key = e.getKey();

	switch(key) {
	    case Ext.event.Event.ENTER:
		// go to first entry if there is one
		if (me.grid.store.getCount() > 0) {
		    me.selectAndHide(me.grid.getSelection()[0].data.id);
		}
		break;
	    case Ext.event.Event.UP:
		me.grid.getSelectionModel().selectPrevious();
		break;
	    case Ext.event.Event.DOWN:
		me.grid.getSelectionModel().selectNext();
		break;
	    case Ext.event.Event.ESC:
		me.grid.hide();
		me.blur();
		break;
	}
    },

    loadValues: function(field) {
	var me = this;
	var records = [];

	me.hasFocus = true;
	me.grid.textfield = me;
	me.grid.store.load();
	me.grid.showBy(me, 'tl-bl');
    },

    hideGrid: function() {
	var me = this;

	me.hasFocus = false;
	if (!me.grid.hasFocus) {
	    me.grid.hide();
	}
    },

    listeners: {
	change: {
	    fn: 'updateFilter',
	    buffer: 250
	},
	specialkey: 'onKey',
	focusenter: 'loadValues',
	focusleave: {
	    fn: 'hideGrid',
	    delay: 100
	}
    },

    toggleFocus: function() {
	var me = this;
	if (!me.hasFocus) {
	    me.focus();
	} else {
	    me.blur();
	}
    },

    initComponent: function() {
	var me = this;

	if (!me.tree) {
	    throw "no tree given";
	}

	me.grid = Ext.create(me.grid);

	me.callParent();

	/*jslint confusion: true*/
	/*because shift is also a function*/
	// bind ctrl+shift+f and ctrl+space
	// to open/close the search
	me.keymap = new Ext.KeyMap({
	    target: Ext.get(document),
	    binding: [{
		key:'F',
		ctrl: true,
		shift: true,
		fn: me.toggleFocus,
		scope: me
	    },{
		key:' ',
		ctrl: true,
		fn: me.toggleFocus,
		scope: me
	    }]
	});

	// always select first item and
	// sort by relevance after load
	me.mon(me.grid.store, 'load', function() {
	    me.grid.getSelectionModel().select(0);
	    me.grid.store.sort({
		property: 'relevance',
		direction: 'DESC'
	    });
	});
    }

});
