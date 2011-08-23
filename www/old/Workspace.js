Ext.ns("PVE");

PVE.Workspace = function() {

    var viewport, content, login;

    var defaultView = { 
	//xtype: "pveTestPanel",
	title: 'Nothing selected',
	border: false,
	region:'center'
    };

    var buildDefaultView = function() {

	PVE.Cache.startUpdate();
	    
	return new Ext.Panel({
	    layout: 'border',
	    border: false,
	    //frame: true,
	    tbar: [ 
		'<img src="/images/proxmox_logo.png">', 
		'->', 
		{ 
		    text: 'Logout',
		    handler: PVE.Workspace.showLogin
		}],
	    items: [
		{
		    layout: 'fit',
		    region: 'center',
		    margins:'5 0 0 0',
		    items: defaultView
		},
		{
		    xtype: 'pveResourceTree',
		    region: 'west',
		    margins:'5 0 0 0',
		    split:true,
		    collapsible: true
		},
		{
		    xtype: 'pveStatusPanel',
		    region:'south',
		    margins:'0 0 0 0',
	    	    height: 200,       
		    collapsible: true,
		    split:true
		}
	    ]
	});
    };

    var buildContent = function() {

	var href = window.location.href;
	var hrefcomp = href.split('?', 2);
	if (hrefcomp.length == 2) {
	    var param = Ext.urlDecode(hrefcomp[1]);
	    if (param.console !== undefined) {
		if (param.console == "kvm") {
	    	    content = new PVE.Console({
	    		vmid: param.vmid,
			node: param.node,
			toplevel: true
		    });
		} else if (param.console == "shell") {
	    	    content = new PVE.Shell({
			node: param.node,
			toplevel: true
		    });
		}
	    } else {
		content = buildDefaultView();
	    } 
	} else {
	    content = buildDefaultView();
	}

	viewport.add(content);
	viewport.doLayout();	
	content.show(); // fire 'show' for PVE.Console
    };

    var workspace = {

	init:  function() {

	    Ext.QuickTips.init();

	    Ext.state.Manager.setProvider(new Ext.state.CookieProvider());

	    viewport = new Ext.Viewport({ layout : 'fit' });
 
            if (!PVE.Utils.authOK()) {
		PVE.Workspace.showLogin();
            } else {
		buildContent();
            }
	},

	setView: function(comp) {

	    if (!content) return;

	    if (!comp) comp = defaultView;

	    var cont = content.find("region", 'center')[0];
	    cont.removeAll(true);
	    cont.add(comp);
	    content.doLayout();
	},

	showLogin: function() {
	    PVE.Utils.authClear();

	    if (!login) {
		login = new PVE.window.LoginWindow({
		    handler: function() {
			if (!content)
			    buildContent();
			login = null;
		    }
		});
	    }
            login.show();
        },

	dummy: "ignore me"
    };

    return workspace;

}();

