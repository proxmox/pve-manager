Ext.define('PVE.lxc.DeviceInputPanel', {
    extend: 'Proxmox.panel.InputPanel',
    mixins: ['Proxmox.Mixin.CBind'],

    autoComplete: false,

    controller: {
	xclass: 'Ext.app.ViewController',
    },

    setVMConfig: function(vmconfig) {
	let me = this;
	me.vmconfig = vmconfig;

	if (me.isCreate) {
	    PVE.Utils.forEachLxcDev((i) => {
		let name = "dev" + i.toString();
		if (!Ext.isDefined(vmconfig[name])) {
		    me.confid = name;
		    me.down('field[name=devid]').setValue(i);
		    return false;
		}
		return undefined;
	    });
	}
    },

    onGetValues: function(values) {
	let me = this;
	let confid = me.isCreate ? "dev" + values.devid : me.confid;
	delete values.devid;
	let val = PVE.Parser.printPropertyString(values, 'path');
	let ret = {};
	ret[confid] = val;
	return ret;
    },

    items: [
	{
	    xtype: 'proxmoxintegerfield',
	    name: 'devid',
	    fieldLabel: gettext('Passthrough ID'),
	    minValue: 0,
	    maxValue: PVE.Utils.dev_count - 1,
	    hidden: true,
	    allowBlank: false,
	    disabled: true,
	    labelAlign: 'right',
	    cbind: {
		hidden: '{!isCreate}',
		disabled: '{!isCreate}',
	    },
	    validator: function(value) {
		let view = this.up('inputpanel');
		if (!view.vmconfig) {
		    return undefined;
		}
		if (Ext.isDefined(view.vmconfig["dev" + value])) {
		    return "Device passthrough is already in use.";
		}
		return true;
	    },
	},
	{
	    xtype: 'textfield',
	    type: 'device',
	    name: 'path',
	    editable: true,
	    allowBlank: false,
	    fieldLabel: gettext('Device Path'),
	    emptyText: '/dev/xyz',
	    labelAlign: 'right',
	    validator: function(value) {
		if (value.startsWith('/dev/')) {
		    return true;
		}

		return "Path has to start with /dev/";
	    },
	},
    ],

    advancedColumn1: [
	{
	    xtype: 'proxmoxintegerfield',
	    name: 'uid',
	    editable: true,
	    fieldLabel: 'UID',
	    emptyText: '0',
	    minValue: 0,
	    labelAlign: 'right',
	},
	{
	    xtype: 'proxmoxintegerfield',
	    name: 'gid',
	    editable: true,
	    fieldLabel: 'GID',
	    emptyText: '0',
	    minValue: 0,
	    labelAlign: 'right',
	},
    ],

    advancedColumn2: [
	{
	    xtype: 'textfield',
	    name: 'mode',
	    editable: true,
	    fieldLabel: gettext('Access Mode'),
	    emptyText: '0660',
	    labelAlign: 'right',
	    validator: function(value) {
		if (/^0[0-7]{3}$|^$/i.test(value)) {
		    return true;
		}

		return "Access mode has to be an octal number";
	    },
	},
    ],
});

Ext.define('PVE.lxc.DeviceEdit', {
    extend: 'Proxmox.window.Edit',

    vmconfig: undefined,

    isAdd: true,
    width: 400,

    initComponent: function() {
	let me = this;

	me.isCreate = !me.confid;

	let ipanel = Ext.create('PVE.lxc.DeviceInputPanel', {
	    confid: me.confid,
	    isCreate: me.isCreate,
	    pveSelNode: me.pveSelNode,
	});

	let subject;
	if (me.isCreate) {
	    subject = gettext('Device');
	} else {
	    subject = gettext('Device') + ' (' + me.confid + ')';
	}

	Ext.apply(me, {
	    subject: subject,
	    items: [ipanel],
	});

	me.callParent();

	me.load({
	    success: function(response, options) {
		ipanel.setVMConfig(response.result.data);
		if (me.isCreate) {
		    return;
		}

		let data = PVE.Parser.parsePropertyString(response.result.data[me.confid], 'path');

		let values = {
		    path: data.path,
		    mode: data.mode,
		    uid: data.uid,
		    gid: data.gid,
		};

		ipanel.setValues(values);
	    },
	});
    },
});
