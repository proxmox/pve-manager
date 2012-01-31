Ext.define('PVE.form.BridgeSelector', {
    extend: 'PVE.form.ComboGrid',
    alias: ['widget.PVE.form.BridgeSelector'],

    setNodename: function(nodename) {
	var me = this;

	if (!nodename || (me.nodename === nodename)) {
	    return;
	}

	me.nodename = nodename;

	me.store.setProxy({
	    type: 'pve',
	    url: '/api2/json/nodes/' + me.nodename + '/network?type=bridge'
	});

	me.store.load();
    },

    initComponent: function() {
	var me = this;

	var nodename = me.nodename;
	me.nodename = undefined; 

	var store = Ext.create('Ext.data.Store', {
	    fields: [ 'iface', 'active', 'type' ],
	    filterOnLoad: true
	});

	Ext.apply(me, {
	    store: store,
	    valueField: 'iface',
	    displayField: 'iface',
            listConfig: {
		columns: [
		    {
			header: 'Bridge',
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

