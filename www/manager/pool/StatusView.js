Ext.define('PVE.pool.StatusView', {
    extend: 'PVE.grid.ObjectGrid',
    alias: ['widget.pvePoolStatusView'],

    initComponent : function() {
	var me = this;

	var pool = me.pveSelNode.data.pool;
	if (!pool) {
	    throw "no pool specified";
	}

	var rows = {
	    comment: {
		header: gettext('Comment'), 
		renderer: Ext.String.htmlEncode,
		required: true
	    }
	};

	Ext.applyIf(me, {
	    title: gettext('Status'),
	    url: "/api2/json/pools/" + pool,
	    cwidth1: 150,
	    interval: 30000,
	    //height: 195,
	    rows: rows
	});

	me.callParent();
    }
});
