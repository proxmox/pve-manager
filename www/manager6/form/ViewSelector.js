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
	let me = this;

	let default_views = {
	    server: {
		text: gettext('Server View'),
		groups: ['node'],
	    },
	    folder: {
		text: gettext('Folder View'),
		groups: ['type'],
	    },
	    pool: {
		text: gettext('Pool View'),
		groups: ['pool'],
		// Pool View only lists VMs and Containers
		filterfn: ({ data }) => data.type === 'qemu' || data.type === 'lxc' || data.type === 'pool',
	    },
	};
	let groupdef = Object.entries(default_views).map(([name, config]) => [name, config.text]);

	let store = Ext.create('Ext.data.Store', {
	    model: 'KeyValue',
	    proxy: {
		type: 'memory',
		reader: 'array',
	    },
	    data: groupdef,
	    autoload: true,
	});

	Ext.apply(me, {
	    store: store,
	    value: groupdef[0][0],
	    getViewFilter: function() {
		let view = me.getValue();
		return Ext.apply({ id: view }, default_views[view] || default_views.server);
	    },
	    getState: function() {
		return { value: me.getValue() };
	    },
	    applyState: function(state, doSelect) {
		let view = me.getValue();
		if (state && state.value && view !== state.value) {
		    let record = store.findRecord('key', state.value, 0, false, true, true);
		    if (record) {
			me.setValue(state.value, true);
			if (doSelect) {
			    me.fireEvent('select', me, [record]);
			}
		    }
		}
	    },
	    stateEvents: ['select'],
	    stateful: true,
	    stateId: 'pveview',
	    id: 'view',
	});

	me.callParent();

	let statechange = function(sp, key, value) {
	    if (key === me.id) {
		me.applyState(value, true);
	    }
	};
	let sp = Ext.state.Manager.getProvider();
	me.mon(sp, 'statechange', statechange, me);
    },
});
