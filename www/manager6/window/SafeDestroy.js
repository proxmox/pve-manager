/* Popup a message window
 * where the user has to manually enter the ressource ID
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
    layout: 'hbox',
    defaultFocus: 'confirmField',

    viewModel: { type: 'default' },

    config: {
	item: {
	    id: undefined,
	    type: undefined
	},
	url: undefined
    },

    applyItem: function(item) {
	var me = this;

	if (!Ext.isDefined(item.id)) {
	    throw "no ID specified";
	}

	if (!Ext.isDefined(item.type)) {
	    throw "no VM type specified";
	}

	me.getViewModel().set('item', item);

	return item;
    },

    controller: {

	xclass: 'Ext.app.ViewController',

	control: {
	    'field[name=confirm]': {
		change: function(f, value) {
		    var view = this.getView();
		    var removeButton = this.lookupReference('removeButton');
		    if (value === view.getItem().id) {
			removeButton.enable();
		    } else {
			removeButton.disable();
		    }
		},
		specialkey: function (field, event) {
		    var removeButton = this.lookupReference('removeButton');
		    if (!removeButton.isDisabled() && event.getKey() == event.ENTER) {
			removeButton.fireEvent('click', removeButton, event);
		    }
		}
	    },
           'button[reference=removeButton]': {
		click: function() {
		    var view = this.getView();
		    PVE.Utils.API2Request({
			url: view.getUrl(),
			method: 'DELETE',
			waitMsgTarget: view,
			failure: function(response, opts) {
			    Ext.Msg.alert('Error', response.htmlStatus);
			},
			callback: function() {
			    view.close();
			}
		    });
		}
            }
	}
    },

    items: [
	{
	    xtype: 'component',
	    cls: [ Ext.baseCSSPrefix + 'message-box-icon',
		   Ext.baseCSSPrefix + 'message-box-warning',
		   Ext.baseCSSPrefix + 'dlg-icon'],
	},
	{
	    xtype: 'container',
	    flex: 1,
	    layout: {
		type: 'vbox',
		align: 'stretch'
	    },
	    items: [
		{
		    xtype: 'component',
		    bind: gettext('Are you sure you want to remove {item.type} {item.id}?') + ' ' +
			gettext('This will permanently erase all data.')
		},
		{
		    reference: 'confirmField',
		    itemId: 'confirmField',
		    xtype: 'numberfield',
		    name: 'confirm',
		    labelWidth: 300,
		    bind: {
			fieldLabel: gettext('Please enter the {item.type} ID to confirm'),
		    },
		    hideTrigger: true,
		    allowBlank: false
		}
	    ],
	}
    ],
    buttons: [
	{
	    reference: 'removeButton',
	    text: gettext('Remove'),
	    disabled: true
	}
    ]
});
