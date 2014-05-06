Ext.define('PVE.form.IPSetSelector', {
    extend: 'PVE.form.ComboGrid',
    alias: ['widget.pveIPSetSelector'],

    initComponent: function() {
	var me = this;

	var store = Ext.create('Ext.data.Store', {
	    autoLoad: true,
	    fields: [ { name: 'name', 
			convert: function(v) {  return '+' + v; }},
		      'comment' ],
	    idProperty: 'name',
	    proxy: {
		type: 'pve',
		url: "/api2/json/cluster/firewall/ipset"
	    },
	    sorters: {
		property: 'name',
		order: 'DESC'
	    }
	});

	Ext.apply(me, {
	    store: store,
	    valueField: 'name',
	    displayField: 'name',
            listConfig: {
		columns: [
		    {
			header: gettext('IPSet'),
			dataIndex: 'name',
			hideable: false,
			width: 100
		    },
		    {
			header: gettext('Comment'),  
			dataIndex: 'comment', 
			flex: 1
		    }
		]
	    }
	});

        me.callParent();
    }
});

