Ext.define('PVE.form.IPSetSelector', {
    extend: 'PVE.form.ComboGrid',
    alias: ['widget.pveIPSetSelector'],

    base_url: undefined,

    initComponent: function() {
	var me = this;

	if (!me.base_url) {
	    throw "no base_url specified";
	}

	var store = Ext.create('Ext.data.Store', {
	    autoLoad: true,
	    fields: [ 'type', 'name', 'ref', 'comment' ],
	    idProperty: 'ref',
	    proxy: {
		type: 'pve',
		url: "/api2/json" + me.base_url
	    },
	    sorters: {
		property: 'ref',
		order: 'DESC'
	    }
	});

	Ext.apply(me, {
	    store: store,
	    valueField: 'ref',
	    displayField: 'ref',
            listConfig: {
		columns: [
		    {
			header: gettext('Type'),
			dataIndex: 'type',
			hideable: false,
			width: 60
		    },
		    {
			header: gettext('Name'),
			dataIndex: 'ref',
			hideable: false,
			width: 140
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

