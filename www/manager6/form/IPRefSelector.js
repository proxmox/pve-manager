Ext.define('PVE.form.IPRefSelector', {
    extend: 'PVE.form.ComboGrid',
    alias: ['widget.pveIPRefSelector'],

    base_url: undefined,

    preferredValue: '', // hack: else Form sets dirty flag?

    ref_type: undefined, // undefined = any [undefined, 'ipset' or 'alias']

    valueField: 'ref',
    displayField: 'ref',

    initComponent: function() {
	var me = this;

	if (!me.base_url) {
	    throw "no base_url specified";
	}

	var url = "/api2/json" + me.base_url;
	if (me.ref_type) {
	    url += "?type=" + me.ref_type;
	}

	var store = Ext.create('Ext.data.Store', {
	    autoLoad: true,
	    fields: [ 'type', 'name', 'ref', 'comment' ],
	    idProperty: 'ref',
	    proxy: {
		type: 'pve',
		url: url
	    },
	    sorters: {
		property: 'ref',
		order: 'DESC'
	    }
	});

	var disable_query_for_ips = function(f, value) {
	    if (value === null || 
		value.match(/^\d/)) { // IP address starts with \d
		f.queryDelay = 9999999999; // hack: disbale with long delay
	    } else {
		f.queryDelay = 10;
	    }
	};

	var columns = [];

	if (!me.ref_type) {
	    columns.push({
		header: gettext('Type'),
		dataIndex: 'type',
		hideable: false,
		width: 60
	    });
	}

	columns.push(
	    {
		header: gettext('Name'),
		dataIndex: 'ref',
		hideable: false,
		width: 140
	    },
	    {
		header: gettext('Comment'),  
		dataIndex: 'comment',
		renderer: Ext.String.htmlEncode,
		flex: 1
	    }
	);

	Ext.apply(me, {
	    store: store,
            listConfig: { columns: columns }
	});

	me.on('change', disable_query_for_ips);

        me.callParent();
    }
});

