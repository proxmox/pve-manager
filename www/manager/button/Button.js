/* Button features:
 * - observe selection changes to enable/disable the button using enableFn()
 * - pop up confirmation dialog using confirmMsg()
 */
Ext.define('PVE.button.Button', {
    extend: 'Ext.button.Button',
    alias: 'widget.pveButton',

    // the selection model to observe
    selModel: undefined,

    // if 'false' handler will not be called (button disabled)
    enableFn: function(record) { },

    // function(record) or text
    confirmMsg: false,

    initComponent: function() {
	/*jslint confusion: true */

        var me = this;

	if (me.handler) {
	    me.realHandler = me.handler;

	    me.handler = function(button, event) {
		var rec, msg;
		if (me.selModel) {
		    rec = me.selModel.getSelection()[0];
		    if (!rec || (me.enableFn(rec) === false)) {
			return;
		    }
		}

		if (me.confirmMsg) {
		    msg = me.confirmMsg;
		    if (Ext.isFunction(me.confirmMsg)) {
			msg = me.confirmMsg(rec);
		    } 
		    Ext.Msg.confirm(gettext('Confirm'), msg, function(btn) {
			if (btn !== 'yes') {
			    return;
			}
			me.realHandler(button, event, rec);
		    });
		} else {
		    me.realHandler(button, event, rec);
		}
	    };
	}

	me.callParent();

	if (me.selModel) {

	    me.mon(me.selModel, "selectionchange", function() {
		var rec = me.selModel.getSelection()[0];
		var enable = me.enableFn(rec);
		if (Ext.isDefined(enable) && enable === false) {
		    me.setDisabled(true);
		} else  {
		    me.setDisabled(false);
		}
	    });
	}
    }
});
