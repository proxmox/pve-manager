Ext.define('PVE.form.BridgeSelector', {
    extend: 'PVE.form.ComboGrid',
    alias: ['widget.PVE.form.BridgeSelector'],

    bridgeType: 'any_bridge', // bridge, OVSBridge or any_bridge

    setNodename: function(nodename) {
	var me = this;

	if (!nodename || (me.nodename === nodename)) {
	    return;
	}

	me.nodename = nodename;

	me.store.setProxy({
	    type: 'pve',
	    url: '/api2/json/nodes/' + me.nodename + '/network?type=' +
		me.bridgeType
	});

	me.store.load();
    },

    initComponent: function() {
	var me = this;

	var nodename = me.nodename;
	me.nodename = undefined; 

	var store = Ext.create('Ext.data.Store', {
	    fields: [ 'iface', 'active', 'type' ],
	    filterOnLoad: true,
	    sorters: [
		{
		    property : 'iface',
		    direction: 'ASC'
		}
	    ]
	});

	Ext.apply(me, {
	    store: store,
	    valueField: 'iface',
	    displayField: 'iface',
            listConfig: {
		columns: [
		    {
			header: gettext('Bridge'),
			dataIndex: 'iface',
			hideable: false,
			flex: 1
		    },
		    {
			header: gettext('Active'),  
			width: 60, 
			dataIndex: 'active', 
			renderer: PVE.Utils.format_boolean
		    }
		]
	    }
	});

        me.callParent();

	if (nodename) {
	    me.setNodename(nodename);
	}
    }
});

