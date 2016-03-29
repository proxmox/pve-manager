/* Popup a message window
 * where the user has to manually enter the ressource ID
 * to enable the destroy button
 */
Ext.define('PVE.window.SafeDestroy', {
    extend: 'Ext.window.Window',
    alias: 'widget.pveSafeDestroy',
    title: gettext('Are you sure?'),
    modal: true,
    buttonAlign: 'center',

    items: [
	{
	    itemId: 'safepanel',
	    xtype: 'container',
	    padding: 10,
	    width: 450,
	    layout: {
		type: 'vbox',
		align: 'stretch'
	    },
	    items: [
		{
		    itemId: 'message',
		    xtype: 'textarea',
		    editable: false,
		},
		{
		    itemId: 'input',
		    xtype: 'numberfield',
		    name: 'VM id',
		    fieldLabel: gettext('Please enter the VM ID to confirm'),
		    hideTrigger:true,
		    allowBlank: false,
		    listeners: {
			change: function(f, value) {
			    if (value === this.vmid) {
				this.submitBtn.enable();
			    } else {
				this.submitBtn.disable();
			    }
			}
		    }
		}
	    ]
	}
    ],
    buttons: [
	{
	    id: 'removeButton',
	    text: gettext('Remove'),
	    disabled: true,
	    handler: function () {
		var me = this;
		PVE.Utils.API2Request({
		    url: me.base_url,
		    method: 'DELETE',
		    waitMsgTarget: me,
		    failure: function(response, opts) {
			Ext.Msg.alert('Error', response.htmlStatus);
		    }
		});
		me.up('window').close();
	    }
	}, {
	    text: gettext('Cancel'),
	    handler: function() {
		this.up('window').close();
	    }
	}
    ],

    initComponent: function() {
	var me = this;
	me.callParent();

	var msg = Ext.String.format(gettext('Are you sure you want to remove VM {0}? This will permanently erase all VM data.'), me.vmid);

	var submitBtn = me.down('toolbar').getComponent('removeButton');
	submitBtn.base_url= me.base_url;

	var safepanel = me.getComponent('safepanel');
	safepanel.getComponent('message').setValue(msg);
	safepanel.getComponent('input').vmid = me.vmid;
	safepanel.getComponent('input').submitBtn = submitBtn;
    }
});
