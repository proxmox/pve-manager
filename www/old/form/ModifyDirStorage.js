Ext.ns("PVE.form");

PVE.form.ModifyDirStorage = Ext.extend(PVE.form.StdForm, {

    initComponent : function() {
	var self = this;

	var storeid = self.confdata.storage;

	var cts = [['images', 'Images']];

	if (storeid === 'local') {
	    cts.push(['vztmpl', 'OpenVZ Templates']);
	    cts.push(['iso', 'ISO']);
	} else {
	    cts.push(['backup', 'Backup']);
	} 

	var items = [
	    {
		xtype: 'hidden',
		name: 'digest'
	    },
	    {
		xtype: 'textfield',
		fieldLabel: 'Storage name',
		name: 'storage',
		value: storeid,
		disabled: true
	    },
	    {
		xtype: 'textfield',
		fieldLabel: 'Directory',
		name: 'path',
		disabled: true
	    },
	    {
		xtype: 'checkbox',
		fieldLabel: 'Disabled',
		inputValue: 1,
		name: 'disable'
	    },
	    {
		xtype: 'checkbox',
		fieldLabel: 'Shared',
		inputValue: 1,
		name: 'shared'
	    },
	    {
		xtype: storeid === 'local' ? 'multiselect' : 'combo',
		forceSelection: true,
		editable: false,
		triggerAction: 'all',
		fieldLabel: 'Content',
		name: storeid === 'local' ? 'content' : 'hiddencontent',
		mode: 'local',
		style : 'margin-bottom:10px',// avoid scrolbars with Firefox
		width: 150,
		height: 'auto',
		store: cts,
		hiddenName: 'content'
	    }
	];

	// NOTE: If subclassing FormPanel, any configuration options for 
	// the BasicForm must be applied to initialConfig
	Ext.apply(self, Ext.apply(self.initialConfig, {
	    url: "/api2/extjs/storage/" + storeid,
	    method: 'PUT',
	    items: {
		layout: 'form',
 		defaults: { anchor: '-20' },
		border: false,
 		items: items
	    }
	}));

	PVE.form.ModifyDirStorage.superclass.initComponent.call(self);

	var form = self.getForm();

	form.load({
	    url: "/api2/extjs/storage/" + storeid,
	    method: 'GET'
	});

    }
});
