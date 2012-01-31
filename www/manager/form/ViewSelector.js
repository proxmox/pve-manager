Ext.define('PVE.form.ViewSelector', {
    extend: 'Ext.form.field.ComboBox',
    alias: ['widget.pveViewSelector'],

    initComponent: function() {
	var me = this;

	var default_views = {
	    server: {
		text: gettext('Server View'),
		groups: ['node']
	    },
	    folder: {
		text: gettext('Folder View'),
		groups: ['type']
	    },
	    storage: {
		text: gettext('Storage View'),
		groups: ['node'],
		filterfn: function(node) {
		    return node.data.type === 'storage';
		}
	    }
	};

	var groupdef = [];
	Ext.Object.each(default_views, function(viewname, value) {
	    groupdef.push([viewname, value.text]);
	});

	var store = Ext.create('Ext.data.Store', {
	    model: 'KeyValue',
            proxy: {
		type: 'memory',
		reader: 'array'
            },
	    data: groupdef,
	    autoload: true,
	    autoDestory: true
	});

	Ext.apply(me, {
	    hideLabel: true,
	    store: store,
	    value: groupdef[0][0],
	    editable: false,
	    queryMode: 'local',
	    allowBlank: false,
	    forceSelection: true,
	    autoSelect: false,
	    triggerAction: 'all',
	    valueField: 'key',
	    displayField: 'value',

	    getViewFilter: function() {
		var view = me.getValue();
		return Ext.apply({ id: view }, default_views[view] || default_views.server);
	    },

	    getState: function() {
		return { value: me.getValue() };
	    },

	    applyState : function(state, doSelect) {
		var view = me.getValue();
		if (state && state.value && (view != state.value)) {
		    var record = store.findRecord('key', state.value);
		    if (record) {
			me.setValue(state.value, true);
			if (doSelect) {
			    me.fireEvent('select', me, [record]);
			}
		    }
		}
	    },
	    stateEvents: [ 'select' ],
	    stateful: true,
	    id: 'view'
	});

	me.callParent();

	var statechange = function(sp, key, value) {
	    if (key === me.id) {
		me.applyState(value, true);
	    }
	};

	var sp = Ext.state.Manager.getProvider();

	me.mon(sp, 'statechange', statechange, me);
    }
});