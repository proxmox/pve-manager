Ext.define('PVE.openvz.CreateWizard', {
    extend: 'PVE.window.Wizard',

    initComponent: function() {
	var me = this;

	Ext.applyIf(me, {
	    title: 'Create new container',
	    items: [
		{
		    title: 'Not implemented',
		    descr: 'Sorry, this fuctionality is not implelemnted',
		    layout: 'fit',
		    html: 'not implemented'
		}
	    ]
	});

	me.callParent();
    }
});



