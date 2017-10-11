/*jslint confusion: true*/
/* filter is a javascript builtin, but extjs calls it also filter */
Ext.define('PVE.form.VMSelector', {
    extend: 'Ext.grid.Panel',
    alias: 'widget.vmselector',

    mixins: {
	field: 'Ext.form.field.Field'
    },

    allowBlank: true,
    selectAll: false,
    isFormField: true,

    plugins: 'gridfilters',

    store: {
	model: 'PVEResources',
	autoLoad: true,
	sorters: 'vmid',
	filters: [{
	    property: 'type',
	    value: /lxc|qemu/
	}]
    },
    columns: [
	{
	    header: 'ID',
	    dataIndex: 'vmid',
	    width: 80,
	    filter: {
		type: 'number'
	    }
	},
	{
	    header: gettext('Node'),
	    dataIndex: 'node'
	},
	{
	    header: gettext('Status'),
	    dataIndex: 'status',
	    filter: {
		type: 'list'
	    }
	},
	{
	    header: gettext('Name'),
	    dataIndex: 'name',
	    flex: 1,
	    filter: {
		type: 'string'
	    }
	},
	{
	    header: gettext('Pool'),
	    dataIndex: 'pool',
	    filter: {
		type: 'list'
	    }
	},
	{
	    header: gettext('Type'),
	    dataIndex: 'type',
	    width: 120,
	    renderer: function(value) {
		if (value === 'qemu') {
		    return gettext('Virtual Machine');
		} else if (value === 'lxc') {
		    return gettext('LXC Container');
		}

		return '';
	    },
	    filter: {
		type: 'list',
		store: {
		    data: [
			{id: 'qemu', text: gettext('Virtual Machine')},
			{id: 'lxc', text: gettext('LXC Container')}
		    ],
		    // due to EXTJS-18711
		    // we have to do a static list via a store
		    // but to avoid creating an object,
		    // we have to have a pseudo un function
		    un: function(){}
		}
	    }
	},
	{
	    header: 'HA ' + gettext('Status'),
	    dataIndex: 'hastate',
	    flex: 1,
	    filter: {
		type: 'list'
	    }
	}
    ],

    selModel: {
	selType: 'checkboxmodel',
	checkOnly: true
    },

    checkChangeEvents: [
	'selectionchange',
	'change'
    ],

    listeners: {
	selectionchange: function() {
	    // to trigger validity and error checks
	    this.checkChange();
	}
    },

    getValue: function() {
	var me = this;
	var sm = me.getSelectionModel();
	var selection = sm.getSelection();
	var values = [];
	var store = me.getStore();
	selection.forEach(function(item) {
	    // only add if not filtered
	    if (store.findExact('vmid', item.data.vmid) !== -1) {
		values.push(item.data.vmid);
	    }
	});
	return values;
    },

    setValue: function(value) {
	console.log(value);
	var me = this;
	var sm = me.getSelectionModel();
	if (!Ext.isArray(value)) {
	    value = value.split(',');
	}
	var selection = [];
	var store = me.getStore();

	value.forEach(function(item) {
	    var rec = store.findRecord('vmid',item, 0, false, true, true);
	    console.log(store);

	    if (rec) {
		console.log(rec);
		selection.push(rec);
	    }
	});

	sm.select(selection);

	return me.mixins.field.setValue.call(me, value);
    },

    getErrors: function(value) {
	var me = this;
	if (me.allowBlank ===  false &&
	    me.getSelectionModel().getCount() === 0) {
	    me.addBodyCls(['x-form-trigger-wrap-default','x-form-trigger-wrap-invalid']);
	    return [gettext('No VM selected')];
	}

	me.removeBodyCls(['x-form-trigger-wrap-default','x-form-trigger-wrap-invalid']);
	return [];
    },

    initComponent: function() {
	var me = this;

	me.callParent();

	if (me.nodename) {
	    me.store.filters.add({
		property: 'node',
		exactMatch: true,
		value: me.nodename
	    });
	}

	// only show the relevant guests by default
	if (me.action) {
	    var statusfilter = '';
	    switch (me.action) {
		case 'startall':
		    statusfilter = 'stopped';
		    break;
		case 'stopall':
		    statusfilter = 'running';
		    break;
	    }
	    if (statusfilter !== '') {
		me.store.filters.add({
		    property: 'template',
		    value: 0
		},{
		    id: 'x-gridfilter-status',
		    operator: 'in',
		    property: 'status',
		    value: [statusfilter]
		});
	    }
	}

	var store = me.getStore();
	var sm = me.getSelectionModel();

	if (me.selectAll) {
	    me.mon(store,'load', function(){
		me.getSelectionModel().selectAll(false);
	    });
	}
    }
});


Ext.define('PVE.form.VMComboSelector', {
    extend: 'PVE.form.ComboGrid',
    alias: 'widget.vmComboSelector',

    valueField: 'vmid',
    displayField: 'vmid',

    autoSelect: false,
    editable: true,
    anyMatch: true,
    forceSelection: true,

    store: {
	model: 'PVEResources',
	autoLoad: true,
	sorters: 'vmid',
	filters: [{
	    property: 'type',
	    value: /lxc|qemu/
	}]
    },

    listConfig: {
	width: 600,
	plugins: 'gridfilters',
	columns: [
	    {
		header: 'ID',
		dataIndex: 'vmid',
		width: 80,
		filter: {
		    type: 'number'
		}
	    },
	    {
		header: gettext('Name'),
		dataIndex: 'name',
		flex: 1,
		filter: {
		    type: 'string'
		}
	    },
	    {
		header: gettext('Node'),
		dataIndex: 'node'
	    },
	    {
		header: gettext('Status'),
		dataIndex: 'status',
		filter: {
		    type: 'list'
		}
	    },
	    {
		header: gettext('Pool'),
		dataIndex: 'pool',
		hidden: true,
		filter: {
		    type: 'list'
		}
	    },
	    {
		header: gettext('Type'),
		dataIndex: 'type',
		width: 120,
		renderer: function(value) {
		    if (value === 'qemu') {
			return gettext('Virtual Machine');
		    } else if (value === 'lxc') {
			return gettext('LXC Container');
		    }

		    return '';
		},
		filter: {
		    type: 'list',
		    store: {
			data: [
			    {id: 'qemu', text: gettext('Virtual Machine')},
			    {id: 'lxc', text: gettext('LXC Container')}
			],
			un: function(){} // due to EXTJS-18711
		    }
		}
	    },
	    {
		header: 'HA ' + gettext('Status'),
		dataIndex: 'hastate',
		hidden: true,
		flex: 1,
		filter: {
		    type: 'list'
		}
	    }
	]
    }
});
