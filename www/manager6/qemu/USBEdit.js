Ext.define('PVE.qemu.USBInputPanel', {
    extend: 'Proxmox.panel.InputPanel',
    mixins: ['Proxmox.Mixin.CBind'],

    autoComplete: false,
    onlineHelp: 'qm_usb_passthrough',

    viewModel: {
	data: {},
    },

    setVMConfig: function(vmconfig) {
	var me = this;
	me.vmconfig = vmconfig;
    },

    onGetValues: function(values) {
	var me = this;
	if (!me.confid) {
	    for (let i = 0; i < PVE.Utils.hardware_counts.usb; i++) {
		let id = 'usb' + i.toString();
		if (!me.vmconfig[id]) {
		    me.confid = id;
		    break;
		}
	    }
	}
	var val = "";
	var type = me.down('radiofield').getGroupValue();
	switch (type) {
	    case 'spice':
		val = 'spice';
		break;
	    case 'hostdevice':
	    case 'port':
		val = 'host=' + values[type];
		delete values[type];
		break;
	    default:
		throw "invalid type selected";
	}

	if (values.usb3) {
	    delete values.usb3;
	    val += ',usb3=1';
	}
	values[me.confid] = val;
	return values;
    },

    items: [
	{
	    xtype: 'fieldcontainer',
	    defaultType: 'radiofield',
	    layout: 'fit',
	    items: [
		{
		    name: 'usb',
		    inputValue: 'spice',
		    boxLabel: gettext('Spice Port'),
		    submitValue: false,
		    checked: true,
		},
		{
		    name: 'usb',
		    inputValue: 'hostdevice',
		    boxLabel: gettext('Use USB Vendor/Device ID'),
		    reference: 'hostdevice',
		    submitValue: false,
		},
		{
		    xtype: 'pveUSBSelector',
		    disabled: true,
		    type: 'device',
		    name: 'hostdevice',
		    cbind: { pveSelNode: '{pveSelNode}' },
		    bind: { disabled: '{!hostdevice.checked}' },
		    editable: true,
		    allowBlank: false,
		    fieldLabel: gettext('Choose Device'),
		    labelAlign: 'right',
		},
		{
		    name: 'usb',
		    inputValue: 'port',
		    boxLabel: gettext('Use USB Port'),
		    reference: 'port',
		    submitValue: false,
		},
		{
		    xtype: 'pveUSBSelector',
		    disabled: true,
		    name: 'port',
		    cbind: { pveSelNode: '{pveSelNode}' },
		    bind: { disabled: '{!port.checked}' },
		    editable: true,
		    type: 'port',
		    allowBlank: false,
		    fieldLabel: gettext('Choose Port'),
		    labelAlign: 'right',
		},
		{
		    xtype: 'checkbox',
		    name: 'usb3',
		    inputValue: true,
		    checked: true,
		    reference: 'usb3',
		    fieldLabel: gettext('Use USB3'),
		},
	    ],
	},
    ],
});

Ext.define('PVE.qemu.USBEdit', {
    extend: 'Proxmox.window.Edit',

    vmconfig: undefined,

    isAdd: true,
    width: 400,
    subject: gettext('USB Device'),

    initComponent: function() {
	var me = this;

	me.isCreate = !me.confid;

	var ipanel = Ext.create('PVE.qemu.USBInputPanel', {
	    confid: me.confid,
	    pveSelNode: me.pveSelNode,
	});

	Ext.apply(me, {
	    items: [ipanel],
	});

	me.callParent();

	me.load({
	    success: function(response, options) {
		ipanel.setVMConfig(response.result.data);
		if (me.isCreate) {
		    return;
		}

		var data = response.result.data[me.confid].split(',');
		var port, hostdevice, usb3 = false;
		var type = 'spice';

		for (let i = 0; i < data.length; i++) {
		    if (/^(host=)?(0x)?[a-zA-Z0-9]{4}:(0x)?[a-zA-Z0-9]{4}$/.test(data[i])) {
			hostdevice = data[i];
			hostdevice = hostdevice.replace('host=', '').replace('0x', '');
			type = 'hostdevice';
		    } else if (/^(host=)?(\d+)-(\d+(\.\d+)*)$/.test(data[i])) {
			port = data[i];
			port = port.replace('host=', '');
			type = 'port';
		    }

		    if (/^usb3=(1|on|true)$/.test(data[i])) {
			usb3 = true;
		    }
		}
		var values = {
		    usb: type,
		    hostdevice: hostdevice,
		    port: port,
		    usb3: usb3,
		};

		ipanel.setValues(values);
	    },
	});
    },
});
