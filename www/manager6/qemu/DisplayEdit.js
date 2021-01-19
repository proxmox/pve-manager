Ext.define('PVE.qemu.DisplayInputPanel', {
    extend: 'Proxmox.panel.InputPanel',
    xtype: 'pveDisplayInputPanel',
    onlineHelp: 'qm_display',

    onGetValues: function(values) {
	var ret = PVE.Parser.printPropertyString(values, 'type');
	if (ret === '') {
	    return {
		'delete': 'vga',
	    };
	}
	return {
	    vga: ret,
	};
    },

    items: [{
	name: 'type',
	xtype: 'proxmoxKVComboBox',
	value: '__default__',
	deleteEmpty: false,
	fieldLabel: gettext('Graphic card'),
	comboItems: PVE.Utils.kvm_vga_driver_array(),
	validator: function() {
	    var v = this.getValue();
	    var cfg = this.up('proxmoxWindowEdit').vmconfig || {};

	    if (v.match(/^serial\d+$/) && (!cfg[v] || cfg[v] !== 'socket')) {
		var fmt = gettext("Serial interface '{0}' is not correctly configured.");
		return Ext.String.format(fmt, v);
	    }
	    return true;
	},
	listeners: {
	    change: function(cb, val) {
		var me = this.up('panel');
		if (!val) {
		    return;
		}
		var disable = false;
		var emptyText = Proxmox.Utils.defaultText;
		switch (val) {
		    case "cirrus":
			emptyText = "4";
			break;
		    case "std":
			emptyText = "16";
			break;
		    case "qxl":
		    case "qxl2":
		    case "qxl3":
		    case "qxl4":
			emptyText = "16";
			break;
		    case "vmware":
			emptyText = "16";
			break;
		    case "none":
		    case "serial0":
		    case "serial1":
		    case "serial2":
		    case "serial3":
			emptyText = 'N/A';
			disable = true;
			break;
		    case "virtio":
			emptyText = "256";
			break;
		    default:
			break;
		}
		var memoryfield = me.down('field[name=memory]');
		memoryfield.setEmptyText(emptyText);
		memoryfield.setDisabled(disable);
	    },
	},
    }, {
	xtype: 'proxmoxintegerfield',
	emptyText: Proxmox.Utils.defaultText,
	fieldLabel: gettext('Memory') + ' (MiB)',
	minValue: 4,
	maxValue: 512,
	step: 4,
	name: 'memory',
    }],
});

Ext.define('PVE.qemu.DisplayEdit', {
    extend: 'Proxmox.window.Edit',

    vmconfig: undefined,

    subject: gettext('Display'),
    width: 350,

    items: [{
	xtype: 'pveDisplayInputPanel',
    }],

    initComponent: function() {
	var me = this;

	me.callParent();

	me.load({
	    success: function(response) {
		me.vmconfig = response.result.data;
		var vga = me.vmconfig.vga || '__default__';
		me.setValues(PVE.Parser.parsePropertyString(vga, 'type'));
	    },
	});
    },
});
