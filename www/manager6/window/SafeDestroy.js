/* Popup a message window
 * where the user has to manually enter the resource ID
 * to enable the destroy button
 */
Ext.define('PVE.window.SafeDestroy', {
    extend: 'Ext.window.Window',
    alias: 'widget.pveSafeDestroy',

    title: gettext('Confirm'),
    modal: true,
    buttonAlign: 'center',
    bodyPadding: 10,
    width: 450,
    layout: { type: 'hbox' },
    defaultFocus: 'confirmField',
    showProgress: false,

    config: {
	item: {
	    id: undefined,
	    type: undefined,
	},
	url: undefined,
	params: {},
    },

    getParams: function() {
	var me = this;
	var purgeCheckbox = me.lookupReference('purgeCheckbox');
	if (purgeCheckbox.checked) {
	    me.params.purge = 1;
	}
	if (Ext.Object.isEmpty(me.params)) {
	    return '';
	}
	return '?' + Ext.Object.toQueryString(me.params);
    },

    controller: {

	xclass: 'Ext.app.ViewController',

	control: {
	    'field[name=confirm]': {
		change: function(f, value) {
		    var view = this.getView();
		    var removeButton = this.lookupReference('removeButton');
		    if (value === view.getItem().id.toString()) {
			removeButton.enable();
		    } else {
			removeButton.disable();
		    }
		},
		specialkey: function(field, event) {
		    var removeButton = this.lookupReference('removeButton');
		    if (!removeButton.isDisabled() && event.getKey() == event.ENTER) {
			removeButton.fireEvent('click', removeButton, event);
		    }
		},
	    },
           'button[reference=removeButton]': {
		click: function() {
		    var view = this.getView();
		    Proxmox.Utils.API2Request({
			url: view.getUrl() + view.getParams(),
			method: 'DELETE',
			waitMsgTarget: view,
			failure: function(response, opts) {
			    view.close();
			    Ext.Msg.alert('Error', response.htmlStatus);
			},
			success: function(response, options) {
			    var hasProgressBar = view.showProgress &&
				response.result.data ? true : false;

			    if (hasProgressBar) {
				// stay around so we can trigger our close events
				// when background action is completed
				view.hide();

				var upid = response.result.data;
				var win = Ext.create('Proxmox.window.TaskProgress', {
				    upid: upid,
				    listeners: {
					destroy: function() {
					    view.close();
					},
				    },
				});
				win.show();
			    } else {
				view.close();
			    }
			},
		    });
		},
            },
	},
    },

    items: [
	{
	    xtype: 'component',
	    cls: [Ext.baseCSSPrefix + 'message-box-icon',
		   Ext.baseCSSPrefix + 'message-box-warning',
		   Ext.baseCSSPrefix + 'dlg-icon'],
	},
	{
	    xtype: 'container',
	    flex: 1,
	    layout: {
		type: 'vbox',
		align: 'stretch',
	    },
	    items: [
		{
		    xtype: 'component',
		    reference: 'messageCmp',
		},
		{
		    itemId: 'confirmField',
		    reference: 'confirmField',
		    xtype: 'textfield',
		    name: 'confirm',
		    labelWidth: 300,
		    hideTrigger: true,
		    allowBlank: false,
		},
		{
		    xtype: 'proxmoxcheckbox',
		    name: 'purge',
		    reference: 'purgeCheckbox',
		    boxLabel: gettext('Purge'),
		    checked: false,
		    autoEl: {
			tag: 'div',
			'data-qtip': gettext('Remove from replication & backup jobs and HA resource configuration.'),
		    },
		},
	    ],
	},
    ],
    buttons: [
	{
	    reference: 'removeButton',
	    text: gettext('Remove'),
	    disabled: true,
	},
    ],

    initComponent: function() {
	var me = this;

	me.callParent();

	var item = me.getItem();

	if (!Ext.isDefined(item.id)) {
	    throw "no ID specified";
	}

	if (!Ext.isDefined(item.type)) {
	    throw "no VM type specified";
	}

	var messageCmp = me.lookupReference('messageCmp');
	var msg;

	if (item.type === 'VM') {
	    msg = Proxmox.Utils.format_task_description('qmdestroy', item.id);
	} else if (item.type === 'CT') {
	    msg = Proxmox.Utils.format_task_description('vzdestroy', item.id);
	} else if (item.type === 'CephPool') {
	    msg = Proxmox.Utils.format_task_description('cephdestroypool', item.id);
	} else if (item.type === 'Image') {
	    msg = Proxmox.Utils.format_task_description('unknownimgdel', item.id);
	} else {
	    throw "unknown item type specified";
	}

	messageCmp.setHtml(msg);

	if (!(item.type === 'VM' || item.type === 'CT')) {
	    let purgeCheckbox = me.lookupReference('purgeCheckbox');
	    purgeCheckbox.setDisabled(true);
	    purgeCheckbox.setHidden(true);
	}

	var confirmField = me.lookupReference('confirmField');
	msg = gettext('Please enter the ID to confirm') +
	    ' (' + item.id + ')';
	confirmField.setFieldLabel(msg);
    },
});
