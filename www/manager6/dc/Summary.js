Ext.define('PVE.dc.Summary', {
    extend: 'Ext.panel.Panel',

    alias: ['widget.pveDcSummary'],

    initComponent: function() {
        var me = this;

	var nodegrid = Ext.create('PVE.dc.NodeView', {
	    title: gettext('Nodes'),
	    border: false,
	    region: 'center',
	    flex: 3
	});

	Ext.apply(me, {
	    layout: 'border',
	    items: [ nodegrid ],
	    listeners: {
		activate: function() {
		    nodegrid.fireEvent('show', nodegrid);
		}
	    }
	});

	me.callParent();
    }
});
