/*
 * Top left combobox, used to select a view of the underneath RessourceTree
 */
Ext.define('PVE.form.ViewSelector', {
    extend: 'Ext.form.field.ComboBox',
    alias: ['widget.pveViewSelector'],

    editable: false,
    allowBlank: false,
    forceSelection: true,
    autoSelect: false,
    valueField: 'key',
    displayField: 'value',
    hideLabel: true,
    queryMode: 'local',

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
		    return node.data.type === 'storage' || node.data.type === 'node';
		}
	    },
	    pool: { 
		text: gettext('Pool View'), 
		groups: ['pool'],
                // Pool View only lists VMs and Containers
                filterfn: function(node) {
                    return node.data.type === 'qemu' || node.data.type === 'lxc' || node.data.type === 'openvz' || 
			node.data.type === 'pool';
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
	    autoload: true
	});

	Ext.apply(me, {
	    store: store,
	    value: groupdef[0][0],
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
	    stateId: 'pveview',
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
