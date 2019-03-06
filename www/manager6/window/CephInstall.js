/*jslint confusion: true*/
Ext.define('PVE.ceph.Install', {
    extend: 'Ext.window.Window',
    xtype: 'pveCephInstallWindow',
    mixins: ['Proxmox.Mixin.CBind'],

    width: 220,
    header: false,
    resizable: false,
    draggable: false,
    modal: true,
    nodename: undefined,
    shadow: false,
    border: false,
    bodyBorder: false,
    closable: false,
    cls: 'install-mask',
    bodyCls: 'install-mask',
    layout: {
        align: 'stretch',
        pack: 'center',
	type: 'vbox'
    },
    viewModel: {
	parent: null,
	data: {
	      cephVersion: 'luminous'
	},
	formulas: {
	    buttonText: function (get){
		return gettext('Install Ceph-') + get('cephVersion');
	    }
	}
    },
    items: [
	{
	    html: '<p class="install-mask">' + Ext.String.format(gettext('{0} is not installed on this node.'), 'Ceph') + '<br>' +
	    gettext('Would you like to install it now?') + '</p>',
	    border: false,
	    padding: 5,
	    bodyCls: 'install-mask'

	},
	{
	    xtype: 'button',
	    bind: {
		text: '{buttonText}'
	    },
	    cbind: {
		nodename: '{nodename}'
	    },
	    handler: function() {
		var me = this.up('pveCephInstallWindow');
		var win = Ext.create('PVE.ceph.CephInstallWizard',{
		    nodename: me.nodename
		});
		win.show();
		me.mon(win,'beforeClose', function(){
		    me.fireEvent("cephInstallWindowClosed");
		    me.close();
		});

	    }
	}
    ]
});
