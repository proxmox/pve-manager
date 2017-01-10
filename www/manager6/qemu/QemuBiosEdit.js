Ext.define('PVE.qemu.BiosEdit', {
    extend: 'PVE.window.Edit',
    alias: 'widget.pveQemuBiosEdit',

    initComponent : function() {
	var me = this;

	var EFIHint = Ext.createWidget({
	    xtype: 'displayfield', //submitValue is false, so we don't get submitted
	    userCls: 'pve-hint',
	    value: 'You need to add an EFI disk for storing the ' +
	    'EFI settings. See the online help for details.',
	    hidden: true
	});

	Ext.applyIf(me, {
	    subject: 'BIOS',
	    items: [ {
		xtype: 'pveQemuBiosSelector',
		onlineHelp: 'qm_bios_and_uefi',
		name: 'bios',
		value: '__default__',
		fieldLabel: 'BIOS',
		listeners: {
		    'change' : function(field, newValue) {
			if (newValue == 'ovmf') {
			    PVE.Utils.API2Request({
				url : me.url,
				method : 'GET',
				failure : function(response, opts) {
				    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
				},
				success : function(response, opts) {
				    var vmConfig = response.result.data;
				    // there can be only one
				    if (!vmConfig.efidisk0) {
					EFIHint.setVisible(true);
				    }
				}
			    });
			} else {
			    if (EFIHint.isVisible()) {
				EFIHint.setVisible(false);
			    }
			}
		    }
		}
	    },
	    EFIHint
	    ] });

	me.callParent();

	me.load();

    }
});
