Ext.ns("PVE");

PVE.ConfigPanel = Ext.extend(Ext.Panel, {

    initComponent : function() {
	var self = this;

	var pveselnode = self.pveSelNode;

	if (!self.xtype)
	    throw "no xtype specified";

	var items = self.items || [];
	self.items = null;

	if (PVE.ConfigPanel.activeTab[self.xtype] === undefined) {
	    PVE.ConfigPanel.activeTab[self.xtype] = 0;
	}

	if (self.showSearch) {
	    items.unshift({
		pveSelNode: pveselnode,
		id: 'search',
		layout: 'fit',
		xtype: 'pveSearch'
	    });
	} else {
	    if (PVE.ConfigPanel.activeTab[self.xtype] === 'search') {
		PVE.ConfigPanel.activeTab[self.xtype] = 0;
	    }
	}

	var tabs = new Ext.TabPanel({
	    activeTab: PVE.ConfigPanel.activeTab[self.xtype],
 	    border: false,	    
 	    items: items,
	    listeners: {
		tabchange: function(tab, item) {
		    var id = item.getId();
		    if (id)
			PVE.ConfigPanel.activeTab[self.xtype] = id;
		}
	    }
	});

	self.items = tabs;

	PVE.ConfigPanel.superclass.initComponent.call(self);

    }
});

PVE.ConfigPanel.activeTab = {};

Ext.reg('pveConfigPanel', PVE.ConfigPanel);

