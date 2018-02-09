Ext.define('PVE.qemu.DisplayEdit', {
    extend: 'Proxmox.window.Edit',

    vmconfig: undefined,

    subject: gettext('Display'),
    width: 350,

    items: [{
	name: 'vga',
	xtype: 'proxmoxKVComboBox',
	value: '__default__',
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
	}
    }],

    initComponent : function() {
	var me = this;

	me.callParent();

	me.load({
	    success: function(response) {
		me.vmconfig = response.result.data;
		me.setValues(me.vmconfig);
	    }
	});
    }
});
