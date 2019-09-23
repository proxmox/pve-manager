Ext.define('PVE.qemu.USBInputPanel', {
    extend: 'Proxmox.panel.InputPanel',
    mixins: ['Proxmox.Mixin.CBind' ],

    autoComplete: false,
    onlineHelp: 'qm_usb_passthrough',

    viewModel: {
	data: {}
    },

    controller: {
	xclass: 'Ext.app.ViewController',

	control: {
	    'pveUSBSelector': {
		change: function(field, newValue, oldValue) {
		    var usbval = field.getUSBValue();
		    var usb3field = this.lookupReference('usb3');
		    var usb3 = /usb3/.test(usbval);
		    if(usb3 && !usb3field.isDisabled()) {
			usb3field.savedVal = usb3field.getValue();
			usb3field.setValue(true);
			usb3field.setDisabled(true);
		    } else if(!usb3 && usb3field.isDisabled()){
			var val = (usb3field.savedVal === undefined)?usb3field.originalValue:usb3field.savedVal;
			usb3field.setValue(val);
			usb3field.setDisabled(false);
		    }
		}
	    }
	}
    },

    setVMConfig: function(vmconfig) {
	var me = this;
	me.vmconfig = vmconfig;
    },

    onGetValues: function(values) {
	var me = this;
	if(!me.confid) {
	    var i;
	    for (i = 0; i < 6; i++) {
		if (!me.vmconfig['usb' +  i.toString()]) {
		    me.confid = 'usb' + i.toString();
		    break;
		}
	    }
	}
	var val = "";
	var type = me.down('radiofield').getGroupValue();
	switch (type) {
	    case 'spice':
		val = 'spice'; break;
	    case 'hostdevice':
	    case 'port':
		val = me.down('pveUSBSelector[name=' + type + ']').getUSBValue();
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
	    items:[
		{
		    name: 'usb',
		    inputValue: 'spice',
		    boxLabel: gettext('Spice Port'),
		    submitValue: false,
		    checked: true
		},
		{
		    name: 'usb',
		    inputValue: 'hostdevice',
		    boxLabel: gettext('Use USB Vendor/Device ID'),
		    reference: 'hostdevice',
		    submitValue: false
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
		    fieldLabel: 'Choose Device',
		    labelAlign: 'right',
		    submitValue: false
		},
		{
		    name: 'usb',
		    inputValue: 'port',
		    boxLabel: gettext('Use USB Port'),
		    reference: 'port',
		    submitValue: false
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
		    submitValue: false
		},
		{
		    xtype: 'checkbox',
		    name: 'usb3',
		    inputValue: true,
		    reference: 'usb3',
		    fieldLabel: gettext('Use USB3')
		}
	    ]
	}
    ]
});

Ext.define('PVE.qemu.USBEdit', {
    extend: 'Proxmox.window.Edit',

    vmconfig: undefined,

    isAdd: true,

    subject: gettext('USB Device'),


    initComponent : function() {
	var me = this;

	me.isCreate = !me.confid;

	var ipanel = Ext.create('PVE.qemu.USBInputPanel', {
	    confid: me.confid,
	    pveSelNode: me.pveSelNode
	});

	Ext.apply(me, {
	    items: [ ipanel ]
	});

	me.callParent();

	me.load({
	    success: function(response, options) {
		ipanel.setVMConfig(response.result.data);
		if (me.confid) {
		    var data = response.result.data[me.confid].split(',');
		    var port, hostdevice, usb3 = false;
		    var type = 'spice';
		    var i;
		    for (i = 0; i < data.length; i++) {
			if (/^(host=)?(0x)?[a-zA-Z0-9]{4}\:(0x)?[a-zA-Z0-9]{4}$/.test(data[i])) {
			    hostdevice = data[i];
			    hostdevice = hostdevice.replace('host=', '').replace('0x','');
			    type = 'hostdevice';
			} else if (/^(host=)?(\d+)\-(\d+(\.\d+)*)$/.test(data[i])) {
			    port = data[i];
			    port = port.replace('host=','');
			    type = 'port';
			}

			if (/^usb3=(1|on|true)$/.test(data[i])) {
			    usb3 = true;
			}
		    }
		    var values = {
			usb : type,
			hostdevice: hostdevice,
			port: port,
			usb3: usb3
		    };

		    ipanel.setValues(values);
		}
	    }
	});
    }
});
