Ext.define('PVE.qemu.OSTypeInputPanel', {
    extend: 'Proxmox.panel.InputPanel',
    alias: 'widget.pveQemuOSTypePanel',
    onlineHelp: 'qm_os_settings',
    insideWizard: false,

    controller: {
	xclass: 'Ext.app.ViewController',
	control: {
	    'combobox[name=osbase]': {
		change: 'onOSBaseChange',
	    },
	    'combobox[name=ostype]': {
		afterrender: 'onOSTypeChange',
		change: 'onOSTypeChange',
	    },
	},
	onOSBaseChange: function(field, value) {
	    this.lookup('ostype').getStore().setData(PVE.Utils.kvm_ostypes[value]);
	},
	onOSTypeChange: function(field) {
	    var me = this, ostype = field.getValue();
	    if (!me.getView().insideWizard) {
		return;
	    }
	    var targetValues = PVE.qemu.OSDefaults.getDefaults(ostype);

	    me.setWidget('pveBusSelector', targetValues.busType);
	    me.setWidget('pveNetworkCardSelector', targetValues.networkCard);
	    me.setWidget('CPUModelSelector', targetValues.cputype);
	    var scsihw = targetValues.scsihw || '__default__';
	    this.getViewModel().set('current.scsihw', scsihw);
	    this.getViewModel().set('current.ostype', ostype);
	},
	setWidget: function(widget, newValue) {
	    // changing a widget is safe only if ComponentQuery.query returns us
	    // a single value array
	    var widgets = Ext.ComponentQuery.query('pveQemuCreateWizard ' + widget);
	    if (widgets.length === 1) {
		widgets[0].setValue(newValue);
	    } else {
		// ignore multiple disks, we only want to set the type if there is a single disk
	    }
	},
    },

    initComponent: function() {
	var me = this;

	me.items = [
	    {
		xtype: 'displayfield',
		value: gettext('Guest OS') + ':',
		hidden: !me.insideWizard,
	    },
	    {
		xtype: 'combobox',
		submitValue: false,
		name: 'osbase',
		fieldLabel: gettext('Type'),
		editable: false,
		queryMode: 'local',
		value: 'Linux',
		store: Object.keys(PVE.Utils.kvm_ostypes),
	    },
	    {
		xtype: 'combobox',
		name: 'ostype',
		reference: 'ostype',
		fieldLabel: gettext('Version'),
		value: 'l26',
		allowBlank: false,
		editable: false,
		queryMode: 'local',
		valueField: 'val',
		displayField: 'desc',
		store: {
		    fields: ['desc', 'val'],
		    data: PVE.Utils.kvm_ostypes.Linux,
		    listeners: {
			datachanged: function(store) {
			    var ostype = me.lookup('ostype');
			    var old_val = ostype.getValue();
			    if (!me.insideWizard && old_val && store.find('val', old_val) !== -1) {
				ostype.setValue(old_val);
			    } else {
				ostype.setValue(store.getAt(0));
			    }
			},
		    },
		},
	    },
	];

	me.callParent();
    },
});

Ext.define('PVE.qemu.OSTypeEdit', {
    extend: 'Proxmox.window.Edit',

    subject: 'OS Type',

    items: [{ xtype: 'pveQemuOSTypePanel' }],

    initComponent: function() {
	var me = this;

	me.callParent();

	me.load({
	    success: function(response, options) {
		var value = response.result.data.ostype || 'other';
		var osinfo = PVE.Utils.get_kvm_osinfo(value);
		me.setValues({ ostype: value, osbase: osinfo.base });
	    },
	});
    },
});
