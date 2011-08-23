Ext.define('PVE.panel.StatusPanel', {
    extend: 'Ext.tab.Panel',
    requires: [
	'Ext.state.Manager',
	'PVE.dc.Log',
	'PVE.dc.Tasks'
    ],
    alias: 'widget.pveStatusPanel',

    title: "Realtime logfile viewer",
    tabPosition: 'bottom',

    initComponent: function() {
        var me = this;

	var stateid = 'ltab';
	var sp = Ext.state.Manager.getProvider();

	var state = sp.get(stateid);
	if (state && state.value) {
	    me.activeTab = state.value;
	}

	Ext.apply(me, {
	    listeners: {
		tabchange: function() {
		    var atab = me.getActiveTab().itemId;
		    var state = { value: atab };
		    sp.set(stateid, state);
		}
	    },
	    items: [
		{
		    itemId: 'clog',
		    title: 'Cluster log',
		    xtype: 'pveClusterLog'
		},
		{
		    itemId: 'tasks',
		    title: 'Recent tasks',
		    xtype: 'pveClusterTasks'
		}
	    ]
	});

	me.callParent();

	me.items.get(0).fireEvent('show', me.items.get(0));

	var statechange = function(sp, key, state) {
	    if (key === stateid) {
		var atab = me.getActiveTab().itemId;
		var ntab = state.value;
		if (state && ntab && (atab != ntab)) {
		    me.setActiveTab(ntab);
		}
	    }
	};

	sp.on('statechange', statechange);
	me.on('destroy', function() {
	    sp.un('statechange', statechange);		    
	});

    }
});
