Ext.define('PVE.ATitleBar', {
    extend: 'Ext.TitleBar',
    alias: ['widget.pveTitleBar'],

    config: {
	docked: 'top',
	pveReloadButton: true,
	pveBackButton: true,
	pveStdMenu: true // add 'Login' and 'Datacenter' to menu by default
    },

    initialize: function() {
	var me = this;

	me.callParent();

	var items = [];

	if (me.getPveBackButton()) {
	    items.push({
		align: 'left',
		iconCls: 'arrow_left',
		handler: function() {
		    PVE.Workspace.goBack();
		}
	    });
	}

	if (me.getPveReloadButton()) {
	    items.push({
		align: 'right',
		iconCls: 'refresh',
		handler: function() {
		    this.up('pvePage').reload();
		}
	    });
	}

	items.push({
	    xtype: 'pveMenuButton',
	    align: 'right',
	    pveStdMenu: me.getPveStdMenu()
	});

	me.setItems(items);
    }


});
