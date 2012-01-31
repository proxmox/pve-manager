Ext.define('PVE.form.PoolSelector', {
    extend: 'PVE.form.ComboGrid',
    alias: ['widget.pvePoolSelector'],

    allowBlank: false,

    initComponent: function() {
	var me = this;

	var store = new Ext.data.Store({
	    model: 'pve-pools'
	});

	Ext.apply(me, {
	    store: store,
	    autoSelect: false,
	    valueField: 'poolid',
	    displayField: 'poolid',
            listConfig: {
		columns: [
		    {
			header: gettext('Pool'),
			sortable: true,
			dataIndex: 'poolid',
			flex: 1
		    },
		    {
			id: 'comment',
			header: 'Comment',
			sortable: false,
			dataIndex: 'comment',
			flex: 1
		    }
		]
	    }
	});

        me.callParent();

	store.load();
    }

}, function() {

    Ext.define('pve-pools', {
	extend: 'Ext.data.Model',
	fields: [ 'poolid', 'comment' ],
	proxy: {
            type: 'pve',
	    url: "/api2/json/pools"
	},
	idProperty: 'poolid'
    });

});
