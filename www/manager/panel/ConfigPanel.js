Ext.define('PVE.panel.Config', {
    extend: 'Ext.tab.Panel',
    requires: [
	'Ext.state.Manager',
	'PVE.grid.ResourceGrid'
    ],
    alias: 'widget.PVE.panel.Config',

    initComponent: function() {
        var me = this;

	var stateid = me.hstateid;

	var sp = Ext.state.Manager.getProvider();

	var items = me.items || [];
	me.items = null;

	Ext.applyIf(me, {
	    title: me.pveSelNode.data.text,
	    showSearch: true,
	    defaults: {} 
	});

	// pass workspace, pveSelNode and viewFilter to all children
	Ext.apply(me.defaults, {
	    pveSelNode: me.pveSelNode,
	    viewFilter: me.viewFilter,
	    workspace: me.workspace,
	    border: false
	});

	if (me.showSearch) {
	    items.unshift({
		itemId: 'search', 
		xtype: 'pveResourceGrid'
	    });
	}

	Ext.apply(me, {
	    listeners: {
		tabchange: function(tp, newcard, oldcard) {
		    var ntab = newcard.itemId;
		    // Note: '' is alias for first tab.
		    // First tab can be 'search' or something else
		    if (newcard.itemId === items[0].itemId) {
			ntab = '';
		    }
		    var state = { value: ntab };
		    if (stateid) {
			sp.set(stateid, state);
		    }
		}
	    },
	    items: items
	});

	if (stateid) {
	    var state = sp.get(stateid);
	    if (state && state.value) {
		me.activeTab = state.value;
	    }
	}

	me.callParent();

	me.items.get(0).fireEvent('show', me.items.get(0));

	var statechange = function(sp, key, state) {
	    if (stateid && key === stateid) {
		var atab = me.getActiveTab().itemId;
		var ntab = state.value || items[0].itemId;
		if (state && ntab && (atab != ntab)) {
		    me.setActiveTab(ntab);
		}
	    }
	};

	if (stateid) {
	    sp.on('statechange', statechange);
	    me.on('destroy', function() {
		sp.un('statechange', statechange);		    
	    });
	}
    }
});
