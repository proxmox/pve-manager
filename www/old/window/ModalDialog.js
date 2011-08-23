Ext.ns("PVE.window");

PVE.window.ModalDialog = Ext.extend(Ext.Window, {

    initComponent: function() {
	var self = this;

	//self.width = self.width ||  800;
	//self.height = self.height || 400;

        Ext.apply(self, {
	    modal: true,
	    border: false,
	    layout: 'fit',
	    maximizable: true
	});

        PVE.window.ModalDialog.superclass.initComponent.call(self);
    }
});