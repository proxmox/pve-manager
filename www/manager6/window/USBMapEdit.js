Ext.define('PVE.window.USBMapEditWindow', {
    extend: 'Proxmox.window.Edit',

    mixins: ['Proxmox.Mixin.CBind'],

    cbindData: function(initialConfig) {
	let me = this;
	me.isCreate = !me.name;
	me.method = me.isCreate ? 'POST' : 'PUT';
	return {
	    name: me.name,
	    nodename: me.nodename,
	};
    },

    submitUrl: function(_url, data) {
	let me = this;
	let name = me.isCreate ? '' : me.name;
	return `/cluster/mapping/usb/${name}`;
    },

    title: gettext('Add USB mapping'),

    onlineHelp: 'resource_mapping',

    method: 'POST',

    controller: {
	xclass: 'Ext.app.ViewController',

	onGetValues: function(values) {
	    let me = this;
	    let view = me.getView();
	    values.node ??= view.nodename;

	    let type = me.getView().down('radiofield').getGroupValue();
	    let name = values.name;
	    let description = values.description;
	    delete values.description;
	    delete values.name;

	    if (type === 'path') {
		let usbsel = me.lookup(type);
		let usbDev = usbsel.getStore().findRecord('usbid', values[type], 0, false, true, true);

		if (!usbDev) {
		    return {};
		}
		values.id = `${usbDev.data.vendid}:${usbDev.data.prodid}`;
	    }

	    let map = [];
	    if (me.originalMap) {
		map = PVE.Parser.filterPropertyStringList(me.originalMap, (e) => e.node !== values.node);
	    }
	    map.push(PVE.Parser.printPropertyString(values));

	    values = {
		map,
		description,
	    };

	    if (view.isCreate) {
		values.id = name;
	    }

	    return values;
	},

	onSetValues: function(values) {
	    let me = this;
	    let view = me.getView();
	    me.originalMap = [...values.map];
	    PVE.Parser.filterPropertyStringList(values.map, (e) => {
		if (e.node === view.nodename) {
		    values = e;
		}
		return false;
	    });

	    if (values.path) {
		values.usb = 'path';
	    }

	    return values;
	},

	modeChange: function(field, value) {
	    let me = this;
	    let type = field.inputValue;
	    let usbsel = me.lookup(type);
	    usbsel.setDisabled(!value);
	},

	nodeChange: function(_field, value) {
	    this.lookup('id').setNodename(value);
	    this.lookup('path').setNodename(value);
	},


	init: function(view) {
	    let me = this;

	    if (!view.nodename) {
		//throw "no nodename given";
	    }
	},

	control: {
	    'radiofield': {
		change: 'modeChange',
	    },
	    'pveNodeSelector': {
		change: 'nodeChange',
	    },
	},
    },

    items: [
	{
	    xtype: 'inputpanel',
	    onGetValues: function(values) {
		return this.up('window').getController().onGetValues(values);
	    },

	    onSetValues: function(values) {
		return this.up('window').getController().onSetValues(values);
	    },

	    column1: [
		{
		    xtype: 'pmxDisplayEditField',
		    fieldLabel: gettext('Name'),
		    cbind: {
			editable: '{!name}',
			value: '{name}',
			submitValue: '{isCreate}',
		    },
		    name: 'name',
		    allowBlank: false,
		},
		{
		    xtype: 'pmxDisplayEditField',
		    fieldLabel: gettext('Node'),
		    name: 'node',
		    editConfig: {
			xtype: 'pveNodeSelector',
		    },
		    cbind: {
			editable: '{!nodename}',
			value: '{nodename}',
		    },
		    allowBlank: false,
		},
	    ],

	    column2: [
		{
		    xtype: 'fieldcontainer',
		    defaultType: 'radiofield',
		    layout: 'fit',
		    items: [
			{
			    name: 'usb',
			    inputValue: 'id',
			    checked: true,
			    boxLabel: gettext('Use USB Vendor/Device ID'),
			    submitValue: false,
			},
			{
			    xtype: 'pveUSBSelector',
			    type: 'device',
			    reference: 'id',
			    name: 'id',
			    cbind: {
				nodename: '{nodename}',
			    },
			    editable: true,
			    allowBlank: false,
			    fieldLabel: gettext('Choose Device'),
			    labelAlign: 'right',
			},
			{
			    name: 'usb',
			    inputValue: 'path',
			    boxLabel: gettext('Use USB Port'),
			    submitValue: false,
			},
			{
			    xtype: 'pveUSBSelector',
			    disabled: true,
			    name: 'path',
			    reference: 'path',
			    cbind: {
				nodename: '{nodename}',
			    },
			    editable: true,
			    type: 'port',
			    allowBlank: false,
			    fieldLabel: gettext('Choose Port'),
			    labelAlign: 'right',
			},
		    ],
		},
	    ],

	    columnB: [
		{
		    xtype: 'proxmoxtextfield',
		    fieldLabel: gettext('Comment'),
		    submitValue: true,
		    name: 'description',
		},
	    ],
	},
    ],
});
