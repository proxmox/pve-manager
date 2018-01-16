Ext.define('PVE.dc.OptionView', {
    extend: 'Proxmox.grid.ObjectGrid',
    alias: ['widget.pveDcOptionView'],

    onlineHelp: 'datacenter_configuration_file',

    monStoreErrors: true,

    initComponent : function() {
	var me = this;

	me.add_combobox_row('keyboard', gettext('Keyboard Layout'), {
	    renderer: PVE.Utils.render_kvm_language,
	    comboItems: PVE.Utils.kvm_keymap_array(),
	    defaultValue: '__default__',
	    deleteEmpty: true
	});
	me.add_text_row('http_proxy', gettext('HTTP proxy'), {
	    defaultValue: Proxmox.Utils.noneText,
	    vtype: 'HttpProxy',
	    deleteEmpty: true
	});
	me.add_combobox_row('console', gettext('Console Viewer'), {
	    renderer: PVE.Utils.render_console_viewer,
	    comboItems: PVE.Utils.console_viewer_array(),
	    defaultValue: '__default__',
	    deleteEmpty: true
	});
	me.add_text_row('email_from', gettext('Email from address'), {
	    deleteEmpty: true,
	    vtype: 'proxmoxMail',
	    defaultValue: 'root@$hostname'
	});
	me.add_text_row('mac_prefix', gettext('MAC address prefix'), {
	    vtype: 'MacPrefix',
	    defaultValue: Proxmox.Utils.noneText
	});

	me.selModel = Ext.create('Ext.selection.RowModel', {});

	Ext.apply(me, {
	    tbar: [{
		text: gettext('Edit'),
		xtype: 'proxmoxButton',
		disabled: true,
		handler: function() { me.run_editor(); },
		selModel: me.selModel
	    }],
	    url: "/api2/json/cluster/options",
	    editorConfig: {
		url: "/api2/extjs/cluster/options"
	    },
	    interval: 5000,
	    cwidth1: 200,
	    listeners: {
		itemdblclick: me.run_editor
	    }
	});

	me.callParent();

	me.on('activate', me.rstore.startUpdate);
	me.on('destroy', me.rstore.stopUpdate);
	me.on('deactivate', me.rstore.stopUpdate);
    }
});
