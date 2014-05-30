Ext.define('PVE.form.IPSetSelector', {
    extend: 'PVE.form.ComboGrid',
    alias: ['widget.pveIPSetSelector'],

    base_url: undefined,

    preferredValue: '', // hack: else Form sets dirty flag?

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

	var disable_query_for_ips = function(f, value) {
	    if (value.match(/^\d/)) { // IP address starts with \d
		f.queryDelay = 9999999999; // hack: disbale with long delay
	    } else {
		f.queryDelay = 10;
	    }
	};

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

	me.on('change', disable_query_for_ips);

        me.callParent();
    }
});

