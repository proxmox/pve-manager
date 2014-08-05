Ext.application({

    launch: function() {
	var me = this;

	PVE.Workspace.setHistory(me.getHistory());

	Ext.Ajax.on('requestexception', function(conn, response) {
	    if (response.status === 401) { 
		PVE.Workspace.showLogin();
	    }
	});
    }
});
